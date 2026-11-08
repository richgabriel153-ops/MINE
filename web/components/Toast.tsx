"use client";

import { useEffect, useState } from "react";

/** Shows the latest notice for a few seconds. A new `id` restarts it. */
export default function Toast({ notice }: { notice: { id: number; text: string } | null }) {
  const [visible, setVisible] = useState<typeof notice>(null);

  useEffect(() => {
    if (!notice) return;
    setVisible(notice);
    const t = setTimeout(() => setVisible(null), 3800);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
      {visible && (
        <p key={visible.id} className="rise rounded-full border border-line bg-surface/95 px-4 py-2.5 text-center text-[14px] shadow-lg shadow-black/30 backdrop-blur">
          {visible.text}
        </p>
      )}
    </div>
  );
}
