"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/useLinkup";
import { SendIcon } from "./icons";

type Props = {
  messages: ChatMessage[];
  ready: boolean;
  connected: boolean;
  ended?: boolean;
  onSend: (text: string) => boolean;
  className?: string;
};

export default function ChatPanel({ messages, ready, connected, ended, onSend, className = "" }: Props) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSend(text)) setText("");
  };

  return (
    <section aria-label="Text chat" className={`flex min-h-0 flex-col ${className}`}>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-4 py-3" aria-live="polite">
        {messages.length === 0 ? (
          <p className="m-auto max-w-[30ch] text-center text-[14px] leading-relaxed text-muted">
            {connected && ready
              ? "Say hi. Messages vanish when either of you leaves."
              : "Text chat opens once you're connected."}
          </p>
        ) : (
          messages.map((m) => (
            <p
              key={m.id}
              className={`rise max-w-[85%] whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug ${
                m.from === "me"
                  ? "self-end rounded-2xl rounded-br-md bg-lime text-lime-ink"
                  : "self-start rounded-2xl rounded-bl-md bg-raised text-ink"
              }`}
            >
              <span className="sr-only">{m.from === "me" ? "You: " : "Stranger: "}</span>
              {m.text}
            </p>
          ))
        )}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!ready}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={ready ? "Type a message" : ended ? "Chat ended" : "Waiting for a stranger…"}
          className="h-11 min-w-0 flex-1 rounded-full bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-muted/80 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-lime disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!ready || !text.trim()}
          className="press grid size-11 shrink-0 place-items-center rounded-full bg-lime text-lime-ink disabled:bg-raised disabled:text-muted"
        >
          <SendIcon className="size-5" />
        </button>
      </form>
    </section>
  );
}
