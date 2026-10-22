import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type scale and shadows in styles.css are custom tokens; without them
// twMerge reads `text-title` as a colour and drops it beside `text-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "label", "body", "title", "display"],
      shadow: ["raised", "floating", "on-media", "edge"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
