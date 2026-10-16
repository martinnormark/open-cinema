import { Box, MapPin, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  referenceImageUrl,
  type CreativeElement,
  type ElementType,
} from "./model";
import "./elements.css";

export const typeIcons: Record<ElementType, LucideIcon> = {
  character: UserRound,
  location: MapPin,
  thing: Box,
};

/** First approved identity reference, else any image the sheet already has. */
export function coverUrl(
  element: CreativeElement,
  outputs: ReadonlyMap<string, string>,
) {
  const candidates = [
    ...element.references.filter((r) => r.status === "approved" && !r.stateId),
    ...element.references.filter((r) => r.status === "exploration"),
  ];
  for (const reference of candidates) {
    const url = referenceImageUrl(reference, outputs);
    if (url) return url;
  }
  return null;
}

export function ElementCover({
  element,
  outputs,
  className,
}: {
  element: CreativeElement;
  outputs: ReadonlyMap<string, string>;
  className?: string;
}) {
  const url = coverUrl(element, outputs);
  const Icon = typeIcons[element.type];
  return (
    <div className={cn("overflow-hidden bg-secondary", className)}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <Icon aria-hidden="true" className="size-8" strokeWidth={1.25} />
        </div>
      )}
    </div>
  );
}
