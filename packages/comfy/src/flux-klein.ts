/** API graph adapted from Comfy-Org's image_flux3_klein_distilled_t2i template.
 * Prompt upsampling is deliberately disabled: the user's text goes straight to CLIP.
 * https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_flux3_klein_distilled_t2i.json
 */
export function fluxKleinWorkflow(prompt: string, seed: number) {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: "flux3_image_klein_sd_int8_convrot.safetensors",
        weight_dtype: "default",
      },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen3vl_4b_int8_convrot.safetensors",
        type: "flux3",
        device: "default",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: "flux2-vae.safetensors" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] } },
    "6": {
      class_type: "EmptyFlux2LatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "7": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: 4,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
        model: ["1", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["7", 0], vae: ["3", 0] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { images: ["8", 0], filename_prefix: "open_cinema_flux3_klein" },
    },
  };
}
