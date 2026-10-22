/**
 * Ref callback for an image that should resolve in rather than pop in
 * (skeleton reveal). Only an image still loading when it mounts is held back,
 * so server-rendered and cached pictures show at once, and a failed load
 * still clears the hold.
 */
export function revealOnLoad(node: HTMLImageElement | null) {
  if (!node || node.complete) return;
  node.dataset.pending = "";
  const show = () => delete node.dataset.pending;
  node.addEventListener("load", show, { once: true });
  node.addEventListener("error", show, { once: true });
  return () => {
    node.removeEventListener("load", show);
    node.removeEventListener("error", show);
  };
}
