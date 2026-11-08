"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, LeftReason, Phase, ServerStatus } from "@/lib/useLinkup";
import ChatPanel from "./ChatPanel";
import VideoView from "./VideoView";
import { CamIcon, CamOffIcon, FlagIcon, Logo, MicIcon, MicOffIcon, NextIcon, StopIcon } from "./icons";

type Props = {
  phase: Phase;
  serverStatus: ServerStatus;
  online: number | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  messages: ChatMessage[];
  micOn: boolean;
  camOn: boolean;
  remoteCamOn: boolean;
  remoteMicOn: boolean;
  chatReady: boolean;
  weak: boolean;
  leftReason: LeftReason | null;
  onNext: () => void;
  onStop: () => void;
  onStart: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onReport: () => void;
  onSend: (text: string) => boolean;
};

const leftCopy: Record<LeftReason, string> = {
  skipped: "The stranger ended the chat.",
  stopped: "The stranger ended the chat.",
  disconnected: "The stranger's connection dropped.",
  failed: "The connection to the stranger failed.",
};

export default function CallScreen(p: Props) {
  const [soundBlocked, setSoundBlocked] = useState(false);
  const onBlocked = useCallback(() => setSoundBlocked(true), []);

  const inCall = p.phase === "matching" || p.phase === "connected";
  const connected = p.phase === "connected";
  const canReport = inCall || p.phase === "left";
  const showRemote = connected && !!p.remoteStream;

  // A short "Connected" moment when video starts, so the match lands.
  const [justConnected, setJustConnected] = useState(false);
  useEffect(() => {
    if (!connected) return;
    setJustConnected(true);
    const t = setTimeout(() => setJustConnected(false), 2400);
    return () => clearTimeout(t);
  }, [connected]);

  // Desktop shortcuts: Esc = Next, M = mic, V = camera (never while typing or in a dialog).
  const { onNext, onToggleMic, onToggleCam, phase } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      if (k === "escape" && phase !== "waiting" && phase !== "stopped") onNext();
      else if (k === "m") onToggleMic();
      else if (k === "v") onToggleCam();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onToggleMic, onToggleCam, phase]);

  const unblockSound = () => {
    document.querySelectorAll("video").forEach((v) => v.play().catch(() => {}));
    setSoundBlocked(false);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row lg:gap-3 lg:p-3">
      {/* Stage: stranger large, me picture-in-picture */}
      <div className="flex min-h-0 flex-[2.3] flex-col lg:flex-1">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-surface lg:rounded-[28px]">
          <VideoView
            stream={p.remoteStream}
            label="Stranger's video"
            onBlocked={onBlocked}
            className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
              showRemote && p.remoteCamOn ? "opacity-100" : "opacity-0"
            }`}
          />

          <StageOverlay {...p} />

          {/* Top bar */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex flex-col items-start gap-2">
              <span className="rounded-full bg-bg/60 px-3 py-1.5 backdrop-blur">
                <Logo className="!text-[16px]" />
              </span>
              {justConnected && !p.weak && <Chip tone="live">Connected</Chip>}
              {connected && p.weak && <Chip tone="warn">Weak connection…</Chip>}
              {connected && !p.remoteMicOn && <Chip>Stranger muted</Chip>}
              {p.serverStatus === "reconnecting" && <Chip tone="warn">Reconnecting to server…</Chip>}
            </div>

            {/* Picture-in-picture self view */}
            <div className="relative aspect-[3/4] w-[26%] min-w-[92px] max-w-[160px] overflow-hidden rounded-2xl border border-ink/15 bg-raised shadow-lg shadow-black/40">
              <VideoView
                stream={p.localStream}
                muted
                mirror
                label="Your video"
                className={`absolute inset-0 size-full object-cover ${p.camOn ? "" : "opacity-0"}`}
              />
              {!p.camOn && (
                <div className="absolute inset-0 grid place-items-center text-muted">
                  <CamOffIcon className="size-6" />
                </div>
              )}
              {!p.micOn && (
                <span className="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-danger text-bg">
                  <MicOffIcon className="size-3.5" />
                </span>
              )}
            </div>
          </div>

          {soundBlocked && showRemote && (
            <button
              type="button"
              onClick={unblockSound}
              className="press absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-lime px-5 py-3 text-[15px] font-medium text-lime-ink"
            >
              Tap to turn on sound
            </button>
          )}
        </div>

        {/* Controls: Stop is kept away from Next so a skip never ends the session by accident */}
        <div className="flex items-center gap-2 bg-bg px-3 py-2.5 lg:px-0 lg:pb-0 lg:pt-3">
          {p.phase !== "stopped" && (
            <button
              type="button"
              onClick={p.onStop}
              className="press flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-raised px-4 text-[15px] hover:bg-line"
            >
              <StopIcon className="size-4" /> Stop
            </button>
          )}
          <span aria-hidden className="mx-0.5 h-6 w-px bg-line" />
          <IconButton
            label={p.micOn ? "Mute microphone (M)" : "Unmute microphone (M)"}
            pressed={!p.micOn}
            danger={!p.micOn}
            onClick={p.onToggleMic}
          >
            {p.micOn ? <MicIcon /> : <MicOffIcon />}
          </IconButton>
          <IconButton
            label={p.camOn ? "Turn camera off (V)" : "Turn camera on (V)"}
            pressed={!p.camOn}
            danger={!p.camOn}
            onClick={p.onToggleCam}
          >
            {p.camOn ? <CamIcon /> : <CamOffIcon />}
          </IconButton>
          <IconButton label="Report stranger" onClick={p.onReport} disabled={!canReport}>
            <FlagIcon />
          </IconButton>

          {p.phase === "stopped" ? (
            <button
              type="button"
              onClick={p.onStart}
              className="press ml-auto flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-lime px-5 text-[16px] font-medium text-lime-ink hover:bg-[#d4f6b3] sm:max-w-[280px]"
            >
              Start again <NextIcon className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={p.onNext}
              disabled={p.phase === "waiting"}
              title="Next (Esc)"
              className="press ml-auto flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-lime px-5 text-[16px] font-medium text-lime-ink hover:bg-[#d4f6b3] disabled:bg-raised disabled:text-muted sm:max-w-[280px]"
            >
              Next <NextIcon className="size-5" />
            </button>
          )}
        </div>
      </div>

      {/* Text chat: below the video on phones, beside it on wide screens */}
      <ChatPanel
        messages={p.messages}
        ready={p.chatReady && connected}
        connected={connected}
        ended={p.phase === "left" || p.phase === "stopped"}
        onSend={p.onSend}
        className="min-h-[148px] flex-1 border-t border-line bg-bg lg:w-[360px] lg:flex-none lg:rounded-[28px] lg:border lg:bg-surface/40"
      />
    </div>
  );
}

function StageOverlay(p: Props) {
  let content: React.ReactNode = null;

  if (p.phase === "waiting") {
    const alone = p.online !== null && p.online <= 1;
    content = (
      <>
        <Radar />
        <h2 className="font-display text-[26px] tracking-[-0.02em]">Waiting for someone…</h2>
        <p className="max-w-[30ch] text-[15px] leading-relaxed text-muted">
          {p.serverStatus !== "open"
            ? "Connecting to Linkup. This takes longer on a slow network."
            : alone
              ? "You're the only one online right now. Keep this tab open and we'll connect you when someone joins."
              : "You'll be connected as soon as someone is free."}
        </p>
      </>
    );
  } else if (p.phase === "matching") {
    content = (
      <>
        <Radar />
        <h2 className="font-display text-[26px] tracking-[-0.02em]">Stranger found</h2>
        <p className="max-w-[30ch] text-[15px] leading-relaxed text-muted">Connecting video. On a slow network this can take a few seconds.</p>
      </>
    );
  } else if (p.phase === "connected" && !p.remoteCamOn) {
    content = (
      <>
        <span className="grid size-16 place-items-center rounded-full bg-raised text-muted">
          <CamOffIcon className="size-7" />
        </span>
        <p className="text-[15px] text-muted">The stranger turned their camera off.</p>
      </>
    );
  } else if (p.phase === "left") {
    content = (
      <>
        <h2 className="font-display text-[30px] tracking-[-0.025em]">Stranger left</h2>
        <p className="max-w-[30ch] text-[15px] leading-relaxed text-muted">
          {leftCopy[p.leftReason ?? "disconnected"]} Tap Next to meet someone new.
        </p>
      </>
    );
  } else if (p.phase === "stopped") {
    content = (
      <>
        <h2 className="font-display text-[30px] tracking-[-0.025em]">Chat stopped</h2>
        <p className="max-w-[30ch] text-[15px] leading-relaxed text-muted">You&apos;re out of the queue. Come back whenever you like.</p>
        <Link href="/" className="mt-1 text-[15px] text-lime underline decoration-lime/40 underline-offset-4 hover:decoration-lime">
          Back to home
        </Link>
      </>
    );
  }

  if (!content) return null;
  return (
    <div role="status" aria-live="polite" className="rise absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 pt-16 text-center">
      {content}
    </div>
  );
}

function Radar() {
  return (
    <span className="relative mb-2 grid size-16 place-items-center" aria-hidden>
      <span className="ping-soft absolute inset-3 rounded-full bg-lime/40" />
      <span className="ping-soft absolute inset-3 rounded-full bg-lime/30 [animation-delay:0.9s]" />
      <span className="relative size-5 rounded-full bg-lime" />
    </span>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "warn" | "live" }) {
  const tones = {
    warn: "bg-warn-bg/85 text-warn",
    live: "bg-bg/70 text-lime",
    plain: "bg-bg/70 text-ink/85",
  };
  return (
    <span className={`rise inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] backdrop-blur ${tones[tone ?? "plain"]}`}>
      {tone === "live" && <span className="size-1.5 rounded-full bg-lime" />}
      {children}
    </span>
  );
}

function IconButton(props: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed}
      className={`press grid size-12 shrink-0 place-items-center rounded-full [&_svg]:size-5 disabled:opacity-40 ${
        props.danger ? "bg-danger text-bg" : "bg-raised text-ink hover:bg-line"
      }`}
    >
      {props.children}
    </button>
  );
}
