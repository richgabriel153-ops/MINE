import type { ComponentType } from "react";

import type { TemplateId } from "@/lib/types";
import { ClassicTemplate } from "./classic";
import { COMPACT_WIDTH, CompactTemplate } from "./compact";
import { ModernTemplate } from "./modern";
import { TEMPLATE_WIDTH, type TemplateProps } from "./shared";

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  width: number;
  Component: ComponentType<TemplateProps>;
}

export const TEMPLATES: readonly TemplateInfo[] = [
  { id: "classic", name: "Classic", description: "Colour header, clear table", width: TEMPLATE_WIDTH, Component: ClassicTemplate },
  { id: "modern", name: "Modern", description: "Big amount, clean list", width: TEMPLATE_WIDTH, Component: ModernTemplate },
  { id: "compact", name: "Compact", description: "Narrow till slip", width: COMPACT_WIDTH, Component: CompactTemplate },
];

export function getTemplate(id: TemplateId): TemplateInfo {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
