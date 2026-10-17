import { RESTAGE_ANGLES, type RestageAngle } from "@open-cinema/contracts";
import {
  LTX23_MODELS,
  ltxSamplerNodes,
  saveVideoNodes,
  sourceClipNodes,
  type Graph,
  type GraphLimits,
  type Link,
} from "./ltx-graph";

/**
 * Re-stage: the same take from a slightly different camera position, built
 * from our own graph on Comfy Cloud with no LoRA but Lightricks' own.
 *
 * 1. MoGe-2 estimates the lens from the first frame, then each frame's
 *    metric geometry with that one field of view, so every frame unprojects
 *    the same way and the moves are in real distances.
 * 2. Each frame becomes a textured mesh and is ray-cast from the new camera.
 *    Triangles across depth edges are dropped, so what the original camera
 *    could not see is left empty and marked in a hole mask.
 * 3. LTX 2.3 with Lightricks' In-Outpainting IC-LoRA fills the holes from the
 *    rest of the take, and a Laplacian blend keeps the re-projected pixels
 *    everywhere else, so faces and the performance are the take's own.
 *
 * The meshes and renders are one node per frame, so the frame count is fixed
 * when the graph is built: the take is padded to `maxFrames` and the result
 * trimmed back to the take's own length.
 */
export const LTX_RESTAGE_MODEL_ID = "comfy-cloud/ltx-2.3-restage";

export const LTX_RESTAGE_MODELS = {
  /** Microsoft's MoGe-2 ViT-L (MIT), in the Comfy Cloud model library. */
  geometry: "moge_2_vitl_normal_fp16.safetensors",
  /** Lightricks' official In-Outpainting IC-LoRA, trained on LTX 2.3. */
  fill: "ltx-2.3-22b-ic-lora-in-outpainting-0.9.safetensors",
} as const;

export const LTX_RESTAGE_LIMITS: GraphLimits = {
  /** About four seconds at 24 or 25 fps; every frame is one mesh and render. */
  maxFrames: 97,
  maxSide: 768,
};

export const LTX_RESTAGE_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
} as const;
export const LTX_RESTAGE_OUTPUT_NODES = [
  "save_result",
  "save_projection",
] as const;

/** The camera keeps aiming at a point this far ahead, in metres. */
const AIM_DISTANCE = 2;

export interface LtxRestageGraphOptions {
  angle: RestageAngle;
  /** What is in the shot; the fill reads it as the whole scene. */
  description: string;
  seed: number;
  /** Fewer frames for a cheap check run; never set by the app. */
  limits?: GraphLimits;
}

export function ltxRestageGraph(o: LtxRestageGraphOptions): Graph {
  const limits = o.limits ?? LTX_RESTAGE_LIMITS;
  const frames = limits.maxFrames;
  const move = RESTAGE_ANGLES[o.angle].move;
  const source = sourceClipNodes(limits);
  const graph: Graph = {
    ...source.nodes,
    // Pad a short take with its last frame, so every per-frame node exists.
    last_index: {
      class_type: "ComfyMathExpression",
      inputs: { expression: "a - 1", "values.a": source.length },
    },
    last_frame: {
      class_type: "ImageFromBatch",
      inputs: {
        image: source.small,
        batch_index: ["last_index", 1],
        length: 1,
      },
    },
    last_repeat: {
      class_type: "RepeatImageBatch",
      inputs: { image: ["last_frame", 0], amount: frames },
    },
    padded_all: {
      class_type: "ImageBatch",
      inputs: { image1: source.small, image2: ["last_repeat", 0] },
    },
    padded: {
      class_type: "ImageFromBatch",
      inputs: { image: ["padded_all", 0], batch_index: 0, length: frames },
    },
    moge: {
      class_type: "LoadMoGeModel",
      inputs: { model_name: LTX_RESTAGE_MODELS.geometry },
    },
    lens_frame: {
      class_type: "ImageFromBatch",
      inputs: { image: ["padded", 0], batch_index: 0, length: 1 },
    },
    lens_geometry: {
      class_type: "MoGeInference",
      inputs: {
        moge_model: ["moge", 0],
        image: ["lens_frame", 0],
        resolution_level: 6,
        fov_x_degrees: 0,
        batch_size: 1,
        force_projection: true,
        apply_mask: true,
        refine_steps: 0,
      },
    },
    lens: {
      class_type: "MoGeGeometryToFOV",
      inputs: {
        moge_geometry: ["lens_geometry", 0],
        axis: "horizontal",
        unit: "degrees",
      },
    },
    geometry: {
      class_type: "MoGeInference",
      inputs: {
        moge_model: ["moge", 0],
        image: ["padded", 0],
        resolution_level: 6,
        fov_x_degrees: ["lens", 0],
        batch_size: 4,
        force_projection: true,
        apply_mask: true,
        refine_steps: 0,
      },
    },
    // RenderMesh takes a vertical field of view; at 90° its tangent is 1, so
    // the zoom alone sets it to match the lens at the take's aspect.
    zoom: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: `a / (b * tan(c * ${(Math.PI / 360).toFixed(8)}))`,
        "values.a": source.genWidth,
        "values.b": source.genHeight,
        "values.c": ["lens", 0],
      },
    },
    camera: {
      class_type: "CreateCameraInfo",
      inputs: {
        mode: "look_at",
        "mode.position_x": move.x,
        "mode.position_y": move.y,
        "mode.position_z": move.z,
        target_x: 0,
        target_y: 0,
        target_z: -AIM_DISTANCE,
        roll: 0,
        fov: 90,
        zoom: ["zoom", 0],
        camera_type: "perspective",
      },
    },
  };

  let projected: Link | null = null;
  let covered: Link | null = null;
  for (let i = 0; i < frames; i++) {
    graph[`mesh_${i}`] = {
      class_type: "MoGePointMapToMesh",
      inputs: {
        moge_geometry: ["geometry", 0],
        batch_index: i,
        decimation: 1,
        discontinuity_threshold: 0.04,
        texture: true,
      },
    };
    graph[`render_${i}`] = {
      class_type: "RenderMesh",
      inputs: {
        mesh: [`mesh_${i}`, 0],
        mode: "texture",
        width: source.genWidth,
        height: source.genHeight,
        background: "#000000",
        camera_info: ["camera", 0],
      },
    };
    graph[`covered_${i}`] = {
      class_type: "MaskToImage",
      inputs: { mask: [`render_${i}`, 1] },
    };
    if (projected && covered) {
      graph[`projected_${i}`] = {
        class_type: "ImageBatch",
        inputs: { image1: projected, image2: [`render_${i}`, 0] },
      };
      graph[`coverage_${i}`] = {
        class_type: "ImageBatch",
        inputs: { image1: covered, image2: [`covered_${i}`, 0] },
      };
      projected = [`projected_${i}`, 0];
      covered = [`coverage_${i}`, 0];
    } else {
      projected = [`render_${i}`, 0];
      covered = [`covered_${i}`, 0];
    }
  }

  Object.assign(graph, {
    coverage: {
      class_type: "ImageToMask",
      inputs: { image: covered!, channel: "red" },
    },
    holes: { class_type: "InvertMask", inputs: { mask: ["coverage", 0] } },
    // A little room around each hole, so the fill blends past torn edges.
    holes_grown: {
      class_type: "LTXVDilateVideoMask",
      inputs: { mask: ["holes", 0], spatial_radius: 10, temporal_radius: 0 },
    },
    fill_reference: {
      class_type: "LTXVInpaintPreprocess",
      inputs: { images: projected!, mask: ["holes_grown", 0] },
    },
  } satisfies Graph);

  const ltx = ltxSamplerNodes({
    id: "ltx",
    checkpoint: LTX23_MODELS.checkpoint,
    textEncoder: LTX23_MODELS.textEncoder,
    loras: [{ name: LTX_RESTAGE_MODELS.fill, strength: 1 }],
    // The fill reads the prompt as the whole scene, not as an edit.
    prompt: o.description.trim(),
    width: source.genWidth,
    height: source.genHeight,
    length: frames,
    fps: source.fps,
    seed: o.seed,
    guide: { image: ["fill_reference", 0], strength: 1 },
  });

  Object.assign(graph, ltx.nodes, {
    // White takes the generation: only the holes and their seams.
    blended: {
      class_type: "LTXVLaplacianPyramidBlend",
      inputs: {
        image_a: ltx.frames,
        image_b: projected!,
        mask: ["holes_grown", 0],
        trim_to_shortest: true,
        mask_low_res_dilation: 8,
      },
    },
    trimmed: {
      class_type: "ImageFromBatch",
      inputs: { image: ["blended", 0], batch_index: 0, length: source.length },
    },
    // Back at the take's size, so the comparison lines up frame for frame.
    restaged: {
      class_type: "ImageScale",
      inputs: {
        image: ["trimmed", 0],
        upscale_method: "lanczos",
        width: source.width,
        height: source.height,
        crop: "disabled",
      },
    },
    projection_trimmed: {
      class_type: "ImageFromBatch",
      inputs: { image: projected!, batch_index: 0, length: source.length },
    },
    // A new angle is a new picture; the take's sound still fits it.
    ...saveVideoNodes(
      "save_result",
      ["restaged", 0],
      source.fps,
      source.audio,
      "restage",
    ),
    // The re-projection before the fill, to see what the take itself covered.
    ...saveVideoNodes(
      "save_projection",
      ["projection_trimmed", 0],
      source.fps,
      null,
      "restage_projection",
    ),
  } satisfies Graph);
  return graph;
}
