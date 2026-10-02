"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { TEMPLATE_WIDTH } from "./shared";

/** Shows a fixed-width template shrunk to fit the screen, exactly as it will look when shared. */
export function ScaledPreview({ width = TEMPLATE_WIDTH, children }: { width?: number; children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      const s = Math.min(1, outer.clientWidth / width);
      setScale(s);
      setHeight(inner.offsetHeight * s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={outerRef} className="w-full overflow-hidden" style={{ height }}>
      <div
        ref={innerRef}
        className="mx-auto overflow-hidden rounded-md shadow-lg ring-1 ring-black/5"
        style={{ width, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}
