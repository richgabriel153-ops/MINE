import { cleanReport } from "@/lib/error-report";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { isServerCloudConfigured, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

/** The phone reports a crash or failed load here, so problems testers hit can be found and fixed. */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 8_000) return new Response(null, { status: 413 });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = cleanReport(parsed);
  if (!report) return new Response(null, { status: 400 });

  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);
  // Always visible in Vercel's logs, even if the database can't be reached.
  console.error("client error", JSON.stringify({ ...report, userAgent }));

  if (!isServerCloudConfigured()) return new Response(null, { status: 204 });
  if (!(await rateLimit(`log-error:${clientIp(request)}`, 600, 30, { failOpen: false }))) return new Response(null, { status: 204 });
  try {
    const user = await requestUser(request);
    const db = supabaseAdmin();
    const { error } = await db.from("client_errors").insert({
      user_id: user?.id ?? null,
      kind: report.kind,
      message: report.message,
      page: report.page,
      digest: report.digest,
      trace: report.trace,
      user_agent: userAgent,
      app_version: report.appVersion,
    });
    if (error) throw error;
    if (Math.random() < 0.05) await db.rpc("_prune_client_errors");
  } catch (err) {
    console.error("could not save client error", err);
  }
  return new Response(null, { status: 204 });
}
