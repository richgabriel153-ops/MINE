"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type Anthropic from "@anthropic-ai/sdk";
import { ArrowUp, Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";

import { useAccess } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { describeAction, type ActionSummary } from "@/lib/agent/actions";
import { runTool, type RunContext } from "@/lib/agent/run";
import { parseToolCall, ToolInputError, WRITE_TOOLS, type ParsedTool } from "@/lib/agent/tools";
import { accessToken } from "@/lib/cloud/client";
import { lagosDate } from "@/lib/dates";
import { getProfile, listDocuments } from "@/lib/db";
import { cn } from "@/lib/utils";

type Msg = Anthropic.Beta.Messages.BetaMessageParam;
type Block = Anthropic.Beta.Messages.BetaContentBlockParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** A confirm card, or the outcome of an action, shown under the assistant's message. */
interface ActionCard {
  id: string;
  summary: ActionSummary;
  state: "pending" | "done" | "cancelled" | "failed";
  link?: { href: string; label: string };
  error?: string;
}

interface Pending {
  messages: Msg[];
  calls: { id: string; call: ParsedTool | null; result?: ToolResult }[];
}

const STORE_KEY = "inceipt.assistant";
const MAX_STEPS = 8;

const SUGGESTIONS = [
  "Receipt for Ada: 2 bags of rice at 45k each, paid by transfer",
  "Who owes me money?",
  "How much did I make this week?",
  "Log ₦5,000 fuel expense",
  "Invoice for Tunde, 3 cartons of indomie at 9,500, due in 7 days",
  "Estimate my tax for this year",
];

function load(): { messages: Msg[]; cards: Record<string, ActionCard> } {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { messages: [], cards: {} };
}

function save(messages: Msg[], cards: Record<string, ActionCard>) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ messages, cards }));
  } catch {
    // Storage full or blocked: the chat just won't survive leaving the page.
  }
}

function textOf(content: Msg["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlockParam => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function toolUses(content: Msg["content"]): Anthropic.Beta.Messages.BetaToolUseBlockParam[] {
  return typeof content === "string" ? [] : content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlockParam => b.type === "tool_use");
}

class AgentError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function AssistantPanel() {
  const { access, showUpgrade } = useAccess();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [cards, setCards] = useState<Record<string, ActionCard>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [business, setBusiness] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef(cards);

  useEffect(() => {
    const stored = load();
    // Drop a turn that was waiting for confirmation when the page was left: it can't be resumed.
    const msgs = stored.messages;
    const lastIsToolUse = msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && toolUses(msgs[msgs.length - 1].content).length > 0;
    const restored = lastIsToolUse ? msgs.slice(0, -2) : msgs;
    const id = setTimeout(() => {
      setMessages(restored);
      setCards(stored.cards);
      cardsRef.current = stored.cards;
    });
    getProfile()
      .then((p) => setBusiness(p.name))
      .catch(() => {});
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, busy]);

  useSaveOnChange(messages, cards);

  const updateCards = (patch: Record<string, ActionCard>) => {
    cardsRef.current = { ...cardsRef.current, ...patch };
    setCards(cardsRef.current);
  };

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (!access.can.assistant)
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Sparkles className="size-8 text-primary" />
          <p className="text-sm">
            Just type what you want, like <em>“Receipt for Ada, 2 bags of rice at ₦45,000, paid by transfer”</em>, and the
            InCeipt Assistant does it for you. It can also tell you who owes you, how much you made and estimate your tax.
          </p>
          <Button onClick={() => showUpgrade("InCeipt Assistant")}>See Pro</Button>
        </CardContent>
      </Card>
    );
  if (access.mode !== "cloud")
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">The assistant needs a free InCeipt account, so your Pro plan and records are kept safe online.</p>
          <Button asChild>
            <Link href="/account?next=%2Fassistant">Sign in or create account</Link>
          </Button>
        </CardContent>
      </Card>
    );

  const runCtx: RunContext = { role: access.role, can: access.can };

  async function callServer(msgs: Msg[]): Promise<{ content: Block[]; stop_reason: string | null }> {
    const token = await accessToken();
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        businessId: access!.cloud!.businessId,
        messages: msgs,
        context: { today: lagosDate(), businessName: business, userName: access!.cloud!.email },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new AgentError(body.error ?? "Something went wrong. Please try again.", body.code);
    if (typeof body.remaining === "number") setRemaining(body.remaining);
    return body.message;
  }

  /** Talk to the server until the assistant is done, or stops to ask for confirmation. */
  async function step(msgs: Msg[], depth = 0): Promise<void> {
    if (depth >= MAX_STEPS) {
      setMessages([...msgs, { role: "assistant", content: "That took too many steps. Please try a simpler request." }]);
      return;
    }
    const reply = await callServer(msgs);
    const withReply: Msg[] = [...msgs, { role: "assistant", content: reply.content }];
    setMessages(withReply);
    if (reply.stop_reason === "max_tokens") {
      setError({ text: "The reply was cut short. Please try a shorter request." });
      return;
    }
    const uses = toolUses(reply.content);
    if (reply.stop_reason !== "tool_use" || uses.length === 0) return;

    const docs = await listDocuments().catch(() => []);
    const calls: Pending["calls"] = [];
    const newCards: Record<string, ActionCard> = {};
    for (const use of uses) {
      let call: ParsedTool | null = null;
      try {
        call = parseToolCall(use.name, use.input);
      } catch (e) {
        const msg = e instanceof ToolInputError ? e.message : "Invalid input.";
        calls.push({ id: use.id, call: null, result: { type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ error: msg }), is_error: true } });
        continue;
      }
      if (WRITE_TOOLS.has(call.name)) {
        try {
          newCards[use.id] = { id: use.id, summary: describeAction(call, lagosDate(), docs), state: "pending" };
          calls.push({ id: use.id, call });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Invalid input.";
          calls.push({ id: use.id, call: null, result: { type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ error: msg }), is_error: true } });
        }
      } else {
        const r = await runTool(call, runCtx);
        if (r.link) newCards[use.id] = { id: use.id, summary: { title: "", lines: [] }, state: "done", link: r.link };
        calls.push({ id: use.id, call, result: { type: "tool_result", tool_use_id: use.id, content: r.content, is_error: r.isError } });
      }
    }
    updateCards(newCards);
    const needsConfirm = calls.some((c) => !c.result);
    if (needsConfirm) {
      setPending({ messages: withReply, calls });
      return;
    }
    await step([...withReply, { role: "user", content: calls.map((c) => c.result!) }], depth + 1);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof AgentError ? { text: e.message, code: e.code } : { text: "No internet connection. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || pending) return;
    setInput("");
    const msgs: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(msgs);
    void run(async () => {
      try {
        await step(msgs);
      } catch (e) {
        // Take the unanswered message back out so the chat stays valid; put the text back in the box.
        setMessages(messages);
        setInput(t);
        throw e;
      }
    });
  };

  const decide = (confirm: boolean) => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    void run(async () => {
      const results: ToolResult[] = [];
      for (const c of p.calls) {
        if (c.result) {
          results.push(c.result);
          continue;
        }
        if (!confirm) {
          updateCards({ [c.id]: { ...cardsRef.current[c.id], state: "cancelled" } });
          results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify({ cancelled: "The user cancelled this action." }) });
          continue;
        }
        const r = await runTool(c.call!, runCtx);
        updateCards({
          [c.id]: { ...cardsRef.current[c.id], state: r.isError ? "failed" : "done", link: r.link, error: r.isError ? errorText(r.content) : undefined },
        });
        results.push({ type: "tool_result", tool_use_id: c.id, content: r.content, is_error: r.isError });
      }
      await step([...p.messages, { role: "user", content: results }], 1);
    });
  };

  const reset = () => {
    setMessages([]);
    setCards({});
    cardsRef.current = {};
    setPending(null);
    setError(null);
  };

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3">
      {empty ? (
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center gap-3 rounded-2xl bg-secondary p-4">
            <Sparkles className="size-8 shrink-0 text-primary" />
            <p className="text-sm">
              Tell me what you want to do. I&apos;ll make receipts, invoices and quotes, record payments, log expenses and answer
              questions about your business. You confirm before anything is saved.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {SUGGESTIONS.filter((s) => access.role === "owner" || !/make|tax|expense/i.test(s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="min-h-11 rounded-xl border bg-card px-3 py-2 text-left text-sm shadow-xs active:bg-muted"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
            <RotateCcw /> New chat
          </Button>
        </div>
      )}

      <ol className="flex flex-1 flex-col gap-3" aria-live="polite">
        {messages.map((m, i) => {
          if (m.role === "user") {
            const text = textOf(m.content);
            return text ? (
              <li key={i} className="ml-10 self-end rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                {text}
              </li>
            ) : null;
          }
          const text = textOf(m.content);
          const actionCards = toolUses(m.content)
            .map((u) => cards[u.id])
            .filter(Boolean);
          return (
            <li key={i} className="mr-6 flex flex-col gap-2">
              {text && <div className="rounded-2xl rounded-bl-sm bg-card px-3.5 py-2 text-sm whitespace-pre-wrap shadow-xs ring-1 ring-border">{text}</div>}
              {actionCards.map((c) => (
                <ActionCardView key={c.id} card={c} />
              ))}
            </li>
          );
        })}
        {busy && (
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Working…
          </li>
        )}
      </ol>

      {pending && (
        <div className="sticky bottom-20 z-10 flex gap-2 rounded-2xl border bg-background p-2 shadow-lg">
          <Button variant="outline" className="flex-1" onClick={() => decide(false)}>
            <X /> Cancel
          </Button>
          <Button className="flex-1" onClick={() => decide(true)}>
            <Check /> {pending.calls.filter((c) => !c.result).length > 1 ? "Confirm all" : "Confirm"}
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {error.text}
          {error.code === "pro_required" && (
            <Button size="sm" onClick={() => showUpgrade("InCeipt Assistant")}>
              See Pro
            </Button>
          )}
          {(error.code === "too_long" || error.code === "bad_chat") && (
            <Button size="sm" variant="outline" onClick={reset}>
              Start a new chat
            </Button>
          )}
        </div>
      )}
      <div ref={endRef} />

      <form
        className="sticky bottom-20 z-10 flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        hidden={Boolean(pending)}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="e.g. Receipt for Ada, 2 bags of rice at 45k"
          aria-label="Message the assistant"
          className="max-h-32 min-h-11 resize-none border-0 shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="icon" className="size-11 shrink-0 rounded-xl" disabled={busy || !input.trim()} aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
      {remaining !== null && remaining <= 10 && (
        <p className="text-center text-xs text-muted-foreground">{remaining} assistant messages left today.</p>
      )}
    </div>
  );
}

function useSaveOnChange(messages: Msg[], cards: Record<string, ActionCard>) {
  useEffect(() => {
    save(messages, cards);
  }, [messages, cards]);
}

function errorText(content: string): string {
  try {
    return (JSON.parse(content) as { error?: string }).error ?? "It didn't work.";
  } catch {
    return "It didn't work.";
  }
}

function ActionCardView({ card }: { card: ActionCard }) {
  if (!card.summary.title)
    return card.link ? (
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href={card.link.href}>{card.link.label}</Link>
      </Button>
    ) : null;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 text-sm shadow-xs",
        card.state === "pending" && "border-primary ring-2 ring-primary/20",
        card.state === "cancelled" && "opacity-60",
        card.state === "failed" && "border-destructive/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">{card.summary.title}</div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {card.state === "pending" ? "Confirm?" : card.state === "done" ? "Done ✓" : card.state === "cancelled" ? "Cancelled" : "Failed"}
        </span>
      </div>
      {card.summary.lines.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground tabular-nums">
          {card.summary.lines.map((l, i) => (
            <li key={i} className={cn(l.startsWith("Total") && "font-semibold text-foreground")}>
              {l}
            </li>
          ))}
        </ul>
      )}
      {card.error && <p className="mt-1 text-destructive">{card.error}</p>}
      {card.link && card.state === "done" && (
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link href={card.link.href}>{card.link.label}</Link>
        </Button>
      )}
    </div>
  );
}
