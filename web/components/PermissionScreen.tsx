"use client";

import Link from "next/link";
import type { MediaErrorKind, Phase } from "@/lib/useLinkup";
import OnlineCount from "./OnlineCount";
import VideoView from "./VideoView";
import { CamIcon, CamOffIcon, Logo, MicIcon, MicOffIcon, NextIcon } from "./icons";

type Props = {
  phase: Phase;
  mediaError: MediaErrorKind | null;
  stream: MediaStream | null;
  online: number | null;
  micOn: boolean;
  camOn: boolean;
  onAllow: () => void;
  onStart: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
};

const errorCopy: Record<MediaErrorKind, { title: string; body: string }> = {
  denied: {
    title: "Camera access is blocked",
    body: "Your browser blocked Linkup from using your camera or microphone. Tap the lock or camera icon in the address bar, set both to Allow, then try again. On iPhone: Settings, then Safari, then Camera and Microphone.",
  },
  "not-found": {
    title: "No camera or microphone found",
    body: "Linkup couldn't find a camera and microphone on this device. Plug one in, or check that they aren't disabled, then try again.",
  },
  "in-use": {
    title: "Your camera is busy",
    body: "Another app or browser tab is using your camera. Close it (video calls are the usual cause) and try again.",
  },
  insecure: {
    title: "This page needs HTTPS",
    body: "Browsers only allow camera access on secure pages. Open the https:// address of this site, or use localhost while developing.",
  },
  unknown: {
    title: "Couldn't start your camera",
    body: "Something went wrong while starting your camera. Reload the page and try again, or try another browser.",
  },
};

export default function PermissionScreen(p: Props) {
  const error = p.phase === "media-error" && p.mediaError ? errorCopy[p.mediaError] : null;
  const ready = p.phase === "ready";
  const pending = p.phase === "media-pending";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-8 sm:pt-6">
        <Link href="/" aria-label="Linkup home">
          <Logo />
        </Link>
        <OnlineCount count={p.online} />
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-7 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 md:grid-cols-2 md:gap-14 sm:px-8">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[340px] overflow-hidden rounded-[28px] border border-line bg-surface md:max-w-[420px]">
          {p.stream && (
            <VideoView
              stream={p.stream}
              muted
              mirror
              label="Your camera preview"
              className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${p.camOn ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {(!p.stream || !p.camOn) && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-3 text-muted">
                <span
                  className={`grid size-16 place-items-center rounded-full ${error ? "bg-danger/10 text-danger" : "bg-raised text-ink/70"}`}
                >
                  {error || !p.camOn ? <CamOffIcon className="size-7" /> : <CamIcon className="size-7" />}
                </span>
                <span className="font-mono text-[12px] uppercase tracking-[0.08em]">
                  {pending ? "Waiting for permission" : !p.camOn && p.stream ? "Camera off" : "Preview"}
                </span>
              </div>
            </div>
          )}
          {ready && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 p-4">
              <ToggleButton on={p.micOn} onClick={p.onToggleMic} onIcon={<MicIcon />} offIcon={<MicOffIcon />} label="microphone" />
              <ToggleButton on={p.camOn} onClick={p.onToggleCam} onIcon={<CamIcon />} offIcon={<CamOffIcon />} label="camera" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5 text-center md:text-left">
          {error ? (
            <>
              <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{error.title}</h1>
              <p className="mx-auto max-w-[42ch] text-[16px] leading-relaxed text-muted md:mx-0" role="alert">
                {error.body}
              </p>
              <button type="button" onClick={p.onAllow} className="press h-14 rounded-full bg-lime text-[17px] font-medium text-lime-ink hover:bg-[#d4f6b3] md:self-start md:px-9">
                Try again
              </button>
            </>
          ) : ready ? (
            <>
              <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.03em] sm:text-[44px]">You look ready</h1>
              <p className="mx-auto max-w-[40ch] text-[16px] leading-relaxed text-muted md:mx-0">
                Check your light and framing. When you start, Linkup pairs you with the next free stranger.
              </p>
              <button type="button" onClick={p.onStart} className="press flex h-14 items-center justify-center gap-2 rounded-full bg-lime text-[17px] font-medium text-lime-ink hover:bg-[#d4f6b3] md:self-start md:px-9">
                Start chatting <NextIcon className="size-5" />
              </button>
            </>
          ) : (
            <>
              <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.03em] sm:text-[44px]">Turn on your camera and mic</h1>
              <p className="mx-auto max-w-[42ch] text-[16px] leading-relaxed text-muted md:mx-0">
                Strangers see and hear you live. Your browser will ask for permission. Video goes straight between
                you and the stranger and is never recorded.
              </p>
              <button
                type="button"
                onClick={p.onAllow}
                disabled={pending}
                className="press h-14 rounded-full bg-lime text-[17px] font-medium text-lime-ink hover:bg-[#d4f6b3] disabled:bg-raised disabled:text-muted md:self-start md:px-9"
              >
                {pending ? "Waiting for permission…" : "Allow camera and mic"}
              </button>
              {pending && <p className="text-[14px] text-muted">Look for the prompt near the address bar.</p>}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ToggleButton(props: { on: boolean; onClick: () => void; onIcon: React.ReactNode; offIcon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={!props.on}
      aria-label={props.on ? `Turn ${props.label} off` : `Turn ${props.label} on`}
      className={`press grid size-12 place-items-center rounded-full backdrop-blur [&_svg]:size-5 ${
        props.on ? "bg-bg/60 text-ink hover:bg-bg/80" : "bg-danger text-bg"
      }`}
    >
      {props.on ? props.onIcon : props.offIcon}
    </button>
  );
}
