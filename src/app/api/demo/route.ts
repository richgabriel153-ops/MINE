import { json } from "@/lib/server/supabase-admin";
import { isPreviewMode } from "@/lib/server/preview";

export const dynamic = "force-dynamic";

/** Whether this deployment offers the Pro preview (test links only), and whether the AI key is added. */
export async function GET() {
  const enabled = isPreviewMode();
  return json({ enabled, assistantReady: enabled && Boolean(process.env.ANTHROPIC_API_KEY) });
}
