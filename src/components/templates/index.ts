import type { ComponentType } from "react";

import type { TemplateId } from "@/lib/types";
import { BoldTemplate } from "./bold";
import { ClassicTemplate } from "./classic";
import { COMPACT_WIDTH, CompactTemplate } from "./compact";
import { ElegantTemplate } from "./elegant";
import { ModernTemplate } from "./modern";
import { TEMPLATE_WIDTH, type TemplateProps } from "./shared";

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  width: number;
  pro: boolean;
  Component: ComponentType<TemplateProps>;
}

export const TEMPLATES: readonly TemplateInfo[] = [
  { id: "classic", name: "Classic", description: "Colour header, clear table", width: TEMPLATE_WIDTH, pro: false, Component: ClassicTemplate },
  { id: "modern", name: "Modern", description: "Big amount, clean list", width: TEMPLATE_WIDTH, pro: false, Component: ModernTemplate },
  { id: "compact", name: "Compact", description: "Narrow till slip", width: COMPACT_WIDTH, pro: false, Component: CompactTemplate },
  { id: "bold", name: "Bold", description: "Full colour, big type", width: TEMPLATE_WIDTH, pro: true, Component: BoldTemplate },
  { id: "elegant", name: "Elegant", description: "Light and stylish", width: TEMPLATE_WIDTH, pro: true, Component: ElegantTemplate },
];

/** The template to draw. Pro templates fall back to Classic when Pro isn't unlocked on this phone. */
export function getTemplate(id: TemplateId, isPro = true): TemplateInfo {
  const found = TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
  return found.pro && !isPro ? TEMPLATES[0] : found;
}
