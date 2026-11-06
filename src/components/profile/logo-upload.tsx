"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { compressLogo } from "@/lib/image";

export function LogoUpload({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressLogo(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not use this picture.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex size-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-input bg-card text-muted-foreground"
        aria-label={value ? "Change logo" : "Add logo"}
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin" />
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data: URL
          <img src={value} alt="Your logo" className="size-full object-contain" />
        ) : (
          <ImagePlus className="size-7" />
        )}
      </button>
      <div className="flex flex-col items-start gap-1">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {value ? "Change logo" : "Add logo"}
        </Button>
        {value ? (
          <Button type="button" variant="link" size="sm" className="h-8 px-0 text-destructive" onClick={() => onChange("")}>
            Remove logo
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Optional. A square picture works best.</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
