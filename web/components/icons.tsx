// Small stroke icon set (24px grid, currentColor) so the bundle stays dependency-free.
type P = { className?: string };
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const MicIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
  </svg>
);
export const MicOffIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 10a7 7 0 0 0 11.2 5.6M19 10a7 7 0 0 1-.6 2.8M12 17v5M3 3l18 18" />
  </svg>
);
export const CamIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="2" y="6" width="14" height="12" rx="3" />
    <path d="m16 10 6-3.5v11L16 14" />
  </svg>
);
export const CamOffIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M10.7 6H13a3 3 0 0 1 3 3v2.3l6-4.8v11M16 16a3 3 0 0 1-3 2H5a3 3 0 0 1-3-3V9a3 3 0 0 1 2.1-2.9M3 3l18 18" />
  </svg>
);
export const FlagIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);
export const StopIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);
export const NextIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const SendIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const ChatIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);

export function Logo({ className = "" }: P) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-[19px] tracking-[-0.02em] ${className}`}>
      <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden className="text-lime">
        <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="17" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      Linkup
    </span>
  );
}
