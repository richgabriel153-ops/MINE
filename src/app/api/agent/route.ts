import Anthropic from "@anthropic-ai/sdk";

import { AGENT_TOOLS } from "@/lib/agent/tools";
import { isServerCloudConfigured, json, memberRole, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.AGENT_MODEL || "claude-opus-5-5";
const EFFORT = (["low", "medium", "high"] as const).find((e) => e === process.env.AGENT_EFFORT) ?? "low";
const DAILY_LIMIT = Math.max(1, Number(process.env.AGENT_DAILY_LIMIT) || 40);
/** Refusal fallbacks (re-run a declined request on another model). Set AGENT_FALLBACKS=off for models that don't support it. */
const FALLBACKS = process.env.AGENT_FALLBACKS !== "off";
const MAX_HISTORY_BYTES = 150_000;
const MAX_MESSAGES = 60;

/** Frozen so it's cached between requests. Anything that changes (date, business, role) goes in the second block. */
const SYSTEM = `You are the InCeipt Assistant, built into InCeipt, a receipt and invoice app for small businesses in Nigeria.
You help the business owner or their staff get things done in the app by using your tools, so they don't have to fill in forms.

How to work:
- Do what the user asks using the tools. Don't describe how to do it in the app when a tool can do it.
- Amounts are in naira. People write "45k" for ₦45,000, "1.2m" for ₦1,200,000, and "2 bags at 45k" means quantity 2, unit price ₦45,000.
- Receipt = customer has paid. Invoice = customer will pay later. Quote/proforma = price offer before a sale.
- If something essential is missing (what was sold, or the price), ask one short question. Otherwise make sensible choices: no customer name is fine; payment method defaults to bank transfer; don't add VAT unless asked.
- To act on an existing document, use its number. If the user names a customer instead, call find_documents first. If several match, ask which one.
- Actions that change records are shown to the user to confirm. If a tool result says the user cancelled, accept it and don't retry unless asked.
- If a tool returns an error, fix the input and try again once, or explain the problem simply.
- You can do several things in one turn (e.g. three receipts) by calling tools more than once.
- After acting, reply in one or two short sentences with the result (e.g. "Done. RCT-0012 for Ada, ₦90,000, paid by transfer."). Use ₦ with thousand separators and DD/MM/YYYY dates.
- Tax answers come from tax_estimate (Nigeria Tax Act 2025). Say they're estimates, not professional tax advice.
- Only help with this business's records and simple business questions. You can't send messages, delete records, change prices of saved documents, change settings or billing, or see other businesses. If asked, say what the user can do in the app instead.
- Keep replies short, plain and friendly. Nigerian English is fine. No markdown tables.`;

let client: Anthropic | null = null;

interface Body {
  businessId?: string;
  messages?: unknown;
  context?: { today?: string; businessName?: string; userName?: string };
}

function validMessages(raw: unknown): Anthropic.Beta.Messages.BetaMessageParam[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  for (const [i, m] of raw.entries()) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== (i % 2 === 0 ? "user" : "assistant")) return null;
    if (typeof content !== "string" && !Array.isArray(content)) return null;
  }
  if ((raw[raw.length - 1] as { role: string }).role !== "user") return null;
  return raw as Anthropic.Beta.Messages.BetaMessageParam[];
}

/** Cache the conversation so far: mark the last block of the last message. */
function withCacheMark(messages: Anthropic.Beta.Messages.BetaMessageParam[]): Anthropic.Beta.Messages.BetaMessageParam[] {
  const last = messages[messages.length - 1];
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] =
    typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
  const tail = content[content.length - 1];
  if (tail && (tail.type === "text" || tail.type === "tool_result")) {
    content[content.length - 1] = { ...tail, cache_control: { type: "ephemeral" } };
  }
  return [...messages.slice(0, -1), { role: "user", content }];
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\r\n]+/g, " ").slice(0, max) : "");

/**
 * POST { businessId, messages, context } → { message: { content, stop_reason }, remaining }
 * The phone runs the tools (with the user's own permissions) and sends the results back as the next user message.
 */
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "The assistant isn't set up yet." }, 503);
  if (!isServerCloudConfigured()) return json({ error: "Accounts aren't set up yet." }, 503);

  let body: Body;
  try {
    const text = await request.text();
    if (text.length > MAX_HISTORY_BYTES) return json({ error: "This chat is too long. Start a new chat.", code: "too_long" }, 413);
    body = JSON.parse(text) as Body;
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const { businessId } = body;
  const messages = validMessages(body.messages);
  if (!businessId || !messages) return json({ error: "Bad request" }, 400);

  const user = await requestUser(request);
  if (!user) return json({ error: "Please sign in again." }, 401);
  const role = await memberRole(user.id, businessId);
  if (!role) return json({ error: "You don't have access to this business." }, 403);

  const db = supabaseAdmin();
  const { data: pro } = await db.rpc("is_pro", { bid: businessId });
  if (!pro) return json({ error: "The assistant is part of InCeipt Pro.", code: "pro_required" }, 402);

  // Only count a message when the person typed something (not when the phone sends tool results back).
  const last = messages[messages.length - 1];
  const typed = typeof last.content === "string" || last.content.some((b) => b.type === "text");
  let remaining: number | null = null;
  if (typed) {
    const { data: used, error } = await db.rpc("agent_take_message", { bid: businessId, day_limit: DAILY_LIMIT });
    if (error) return json({ error: "Something went wrong. Please try again." }, 500);
    if (used === -1) return json({ error: `You've used today's ${DAILY_LIMIT} assistant messages. It resets at midnight.`, code: "limit" }, 429);
    remaining = DAILY_LIMIT - Number(used);
  }

  const ctx = body.context ?? {};
  const today = /^\d{4}-\d{2}-\d{2}$/.test(ctx.today ?? "") ? ctx.today! : new Date().toISOString().slice(0, 10);
  const dynamicContext = `Today is ${today} (Africa/Lagos). Business: ${clean(ctx.businessName, 80) || "(no name yet)"}. You're helping ${
    clean(ctx.userName, 60) || user.email
  }, who is the ${role === "owner" ? "owner" : "a staff member (can make receipts, invoices and quotes and record payments; can't see totals, profit, expenses or tax)"}.`;

  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: EFFORT },
      ...(FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: dynamicContext },
      ],
      tools: AGENT_TOOLS.map((t) => ({ ...t, strict: true })),
      tool_choice: { type: "auto" },
      messages: withCacheMark(messages),
    });

    await db.rpc("agent_add_tokens", {
      bid: businessId,
      p_input: (response.usage.input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0),
      p_output: response.usage.output_tokens ?? 0,
    });

    if (response.stop_reason === "refusal") {
      return json({
        message: { content: [{ type: "text", text: "Sorry, I can't help with that. Try asking in a different way." }], stop_reason: "end_turn" },
        remaining,
        refused: true,
      });
    }
    return json({ message: { content: response.content, stop_reason: response.stop_reason }, remaining });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError)
      return json({ error: "The assistant is busy right now. Please try again in a minute." }, 503);
    if (e instanceof Anthropic.BadRequestError) {
      console.error("assistant bad request", e.message);
      return json({ error: "Something went wrong with this chat. Start a new chat.", code: "bad_chat" }, 400);
    }
    if (e instanceof Anthropic.APIConnectionError) return json({ error: "Couldn't reach the assistant. Please try again." }, 503);
    console.error("assistant error", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
