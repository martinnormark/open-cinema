import { http, HttpResponse } from "msw";

const CLOUD = "https://cloud.comfy.org";
const STORAGE = "https://storage.googleapis.com/comfy-cloud-assets";

export interface CloudMediaRun {
  operation: string;
  graph: Record<
    string,
    { class_type: string; inputs: Record<string, unknown> }
  >;
  /** The bytes of each uploaded part, by the loader node that reads it. */
  parts: Record<string, Uint8Array>;
}

/**
 * Comfy Cloud's ComfyUI-compatible routes as the media steps use them: upload,
 * prompt, job status, and a view link that redirects to signed storage. Each
 * run answers with `rendered[operation]`; `available()` false answers 503.
 */
export function cloudMedia(
  rendered: Record<string, Uint8Array>,
  available: () => boolean = () => true,
) {
  const uploads = new Map<string, Uint8Array>();
  const runs: CloudMediaRun[] = [];
  const outputs = new Map<string, string>();
  const handlers = [
    http.post(`${CLOUD}/api/upload/image`, async ({ request }) => {
      const form = await request.formData();
      if (!available()) return new HttpResponse("starting", { status: 503 });
      const file = form.get("image") as File;
      uploads.set(file.name, new Uint8Array(await file.arrayBuffer()));
      return HttpResponse.json({
        name: file.name,
        subfolder: "",
        type: "input",
      });
    }),
    http.post(`${CLOUD}/api/prompt`, async ({ request }) => {
      const { prompt } = (await request.json()) as {
        prompt: CloudMediaRun["graph"];
      };
      const prefix = String(prompt.save!.inputs.filename_prefix);
      const operation = prefix.split("/").pop()!;
      const parts: CloudMediaRun["parts"] = {};
      for (const node of ["source", "edit", "matte"]) {
        const loader = prompt[node];
        const file = loader && (loader.inputs.file ?? loader.inputs.video);
        if (typeof file === "string") parts[node] = uploads.get(file)!;
      }
      runs.push({ operation, graph: prompt, parts });
      const id = crypto.randomUUID();
      outputs.set(id, operation);
      return HttpResponse.json({ prompt_id: id, number: 0, node_errors: {} });
    }),
    http.get(`${CLOUD}/api/jobs/:id`, ({ params }) => {
      const id = String(params.id);
      return HttpResponse.json({
        id,
        status: "completed",
        outputs: {
          save: {
            images: [
              {
                filename: `${id}.mp4`,
                subfolder: "open_cinema",
                type: "output",
              },
            ],
          },
        },
      });
    }),
    http.get(`${CLOUD}/api/view`, ({ request }) => {
      const filename = new URL(request.url).searchParams.get("filename");
      return new HttpResponse(null, {
        status: 302,
        headers: { Location: `${STORAGE}/${filename}` },
      });
    }),
    http.get(`${STORAGE}/:file`, ({ params }) => {
      const id = String(params.file).replace(/\.mp4$/, "");
      const body = rendered[outputs.get(id) ?? ""];
      if (!body) return new HttpResponse(null, { status: 404 });
      return new HttpResponse(body, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(body.length),
        },
      });
    }),
  ];
  return { handlers, runs };
}
