"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Share2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Segmented } from "@/components/form/segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BackupError, backupFileName, parseBackup, type BackupFile, type ImportMode } from "@/lib/backup";
import { formatDate, lagosDate } from "@/lib/dates";
import { exportAll, getSettings, importBackup, updateSettings } from "@/lib/db";
import { downloadBlob } from "@/lib/share";

const MODES = [
  { value: "merge", label: "Add to this phone" },
  { value: "replace", label: "Replace everything" },
] as const satisfies readonly { value: ImportMode; label: string }[];

const noSubscribe = () => () => {};

function canShareJsonFiles(): boolean {
  const probe = new File(["{}"], "probe.json", { type: "application/json" });
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
}

function when(iso: string): string {
  return iso ? formatDate(lagosDate(new Date(iso))) : "";
}

export function BackupCard() {
  const { access } = useAccess();
  if (access?.mode === "cloud")
    return (
      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <CardDescription>
            You&apos;re signed in, so your records are saved in your InCeipt account automatically. Sign in on a new
            phone to see them.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  return <PhoneBackupCard />;
}

function PhoneBackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const canShareFiles = useSyncExternalStore(noSubscribe, canShareJsonFiles, () => false);

  useEffect(() => {
    getSettings().then((s) => setLastBackupAt(s.lastBackupAt));
  }, []);

  async function makeBackupFile(): Promise<File> {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    return new File([blob], backupFileName(lagosDate()), { type: "application/json" });
  }

  async function markBackedUp(count: number) {
    const now = new Date().toISOString();
    await updateSettings({ lastBackupAt: now });
    setLastBackupAt(now);
    toast.success(`Backup saved: ${count} ${count === 1 ? "record" : "records"}`);
  }

  async function onDownload() {
    setBusy(true);
    try {
      const file = await makeBackupFile();
      downloadBlob(file, file.name);
      await markBackedUp(JSON.parse(await file.text()).documents.length);
    } catch {
      toast.error("Could not make the backup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    setBusy(true);
    try {
      const file = await makeBackupFile();
      await navigator.share({ files: [file], title: "InCeipt backup" });
      await markBackedUp(JSON.parse(await file.text()).documents.length);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("Sharing didn't work. Use “Download backup” instead.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
      setMode("merge");
    } catch (err) {
      toast.error(err instanceof BackupError ? err.message : "Could not read this file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onRestore() {
    if (!pending) return;
    setBusy(true);
    try {
      const plan = await importBackup(pending, mode);
      setPending(null);
      toast.success(
        mode === "replace"
          ? `Restored ${plan.documents.length} records`
          : `Added ${plan.added} new ${plan.added === 1 ? "record" : "records"}${plan.updated ? `, updated ${plan.updated}` : ""}`,
      );
    } catch {
      toast.error("Could not restore the backup. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>
          Your receipts are saved only on this phone. Save a backup file to keep them safe, for example in Google Drive or
          sent to yourself on WhatsApp, and restore it on a new phone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">
          {lastBackupAt === null ? " " : lastBackupAt ? `Last backup: ${when(lastBackupAt)}` : "You haven't made a backup yet."}
        </p>
        {canShareFiles && (
          <Button onClick={onShare} disabled={busy}>
            <Share2 /> Save backup to Drive or WhatsApp
          </Button>
        )}
        <Button variant={canShareFiles ? "outline" : "default"} onClick={onDownload} disabled={busy}>
          <Download /> Download backup file
        </Button>
        <div className="my-1 border-t" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload /> Restore from a backup file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => onPickFile(e.target.files?.[0])}
        />
      </CardContent>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>Restore this backup?</DialogTitle>
                <DialogDescription>
                  {pending.documents.length} {pending.documents.length === 1 ? "record" : "records"}
                  {pending.profile.name && ` from ${pending.profile.name}`}
                  {pending.exportedAt && `, saved ${when(pending.exportedAt)}`}.
                </DialogDescription>
              </DialogHeader>
              <Segmented label="How to restore" value={mode} onChange={setMode} options={MODES} />
              <p className="text-sm text-muted-foreground">
                {mode === "merge"
                  ? "Keeps everything already on this phone and adds what's missing."
                  : "Deletes everything on this phone first, then restores the backup, including the business details."}
              </p>
              <DialogFooter>
                <Button size="lg" variant={mode === "replace" ? "destructive" : "default"} onClick={onRestore} disabled={busy}>
                  {busy ? "Restoring…" : mode === "replace" ? "Replace and restore" : "Restore"}
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
