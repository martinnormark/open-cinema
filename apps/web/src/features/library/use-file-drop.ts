import { useRef, useState, type DragEvent } from "react";

function hasFiles(event: DragEvent) {
  return event.dataTransfer.types.includes("Files");
}

/** Drag-and-drop handlers for a drop region; nested children do not flicker it. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  return {
    active,
    handlers: {
      onDragEnter(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      },
      onDragOver(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDragLeave(event: DragEvent) {
        if (!hasFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      },
      onDrop(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length) onFiles(files);
      },
    },
  };
}
