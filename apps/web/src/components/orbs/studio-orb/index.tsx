"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { studioOrb } from "@/components/orbs/studio-orb/meta";

export { meta, studioOrb } from "@/components/orbs/studio-orb/meta";

export type StudioOrbProps = Omit<ShaderOrbProps, "variant">;

export const StudioOrb = ({ size = 280, ...rest }: StudioOrbProps) => (
  <ShaderOrb variant={studioOrb} size={size} {...rest} />
);

export default StudioOrb;
