/**
 * Who made the model behind a job and where it ran, keyed by the model name a
 * job records (`Job.model`, a workflow definition's `displayModel`). The studio
 * shows this on every result, so a creator always knows which model made it.
 */
export interface ModelCard {
  maker: string;
  /** "open" when the weights are published and run on Comfy Cloud. */
  weights: "open" | "hosted";
  runsOn: "Comfy Router" | "Comfy Cloud";
}

const router = (maker: string): ModelCard => ({
  maker,
  weights: "hosted",
  runsOn: "Comfy Router",
});
const cloud = (maker: string): ModelCard => ({
  maker,
  weights: "open",
  runsOn: "Comfy Cloud",
});

export const MODEL_CARDS: Record<string, ModelCard> = {
  "FLUX 3 Image": router("Black Forest Labs"),
  "FLUX 3 Image · character workflow": {
    maker: "Black Forest Labs",
    weights: "hosted",
    runsOn: "Comfy Cloud",
  },
  "FLUX 3 Image Klein": cloud("Black Forest Labs"),
  "FLUX 3 Video": router("Black Forest Labs"),
  "LTX 2.5": router("Lightricks"),
  "LTX-2 camera LoRA": cloud("Lightricks"),
  "LTX 2.5 Alpha Gen": cloud("Lightricks"),
  "LTX 2.3": cloud("Lightricks"),
  "LTX 2.3 Union Control": cloud("Lightricks"),
  "LTX 2.3 In-Outpainting IC-LoRA": cloud("Lightricks"),
  "LTX 2.3 outpainting IC-LoRA": cloud("Lightricks"),
  "LTX 2.3 + Lightricks effect IC-LoRA": cloud("Lightricks"),
  "FLUX 3 Klein + LTX 2.3": cloud("Black Forest Labs and Lightricks"),
  "MoGe-2 + LTX 2.3 In-Outpainting": cloud("Microsoft and Lightricks"),
  "Wan 2.1 VACE": cloud("Alibaba (Tongyi Wan)"),
  "Kling 3.0 Omni": router("Kuaishou"),
  "Seedance 2.5": router("ByteDance"),
  "Wan 3.0": router("Alibaba (Tongyi Wan)"),
  // SAM 3.1's open weights track who is who; Wan 3.0 stays a hosted model,
  // called from the same Comfy Cloud graph.
  "SAM 3.1 + Wan 3.0": {
    maker: "Meta and Alibaba (Tongyi Wan)",
    weights: "hosted",
    runsOn: "Comfy Cloud",
  },
  "FLUX 3 Klein + Wan Animate 2": cloud("Black Forest Labs and Alibaba"),
};

export function modelCard(model: string): ModelCard | null {
  return MODEL_CARDS[model] ?? null;
}

/** One line, e.g. "Wan 3.0 by Alibaba (Tongyi Wan), hosted, via Comfy Router". */
export function modelCredit(model: string): string {
  const card = modelCard(model);
  if (!card) return model;
  return `${model} by ${card.maker}, ${card.weights === "open" ? "open weights" : "hosted"}, via ${card.runsOn}`;
}
