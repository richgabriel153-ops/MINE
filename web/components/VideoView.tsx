"use client";

import { useEffect, useRef } from "react";

type Props = {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
  /** Called when the browser blocks autoplay with sound (needs a tap to start). */
  onBlocked?: () => void;
  label: string;
};

export default function VideoView({ stream, muted, mirror, className = "", onBlocked, label }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) el.play().catch(() => onBlocked?.());
  }, [stream, onBlocked]);

  return (
    <video
      ref={ref}
      aria-label={label}
      autoPlay
      playsInline
      muted={muted}
      className={`${mirror ? "mirror" : ""} ${className}`}
    />
  );
}
