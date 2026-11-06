"use client";

import { useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { accessToken } from "@/lib/cloud/client";
import { signOut } from "@/lib/cloud/session";
import { lagosDate } from "@/lib/dates";
import { exportMyData } from "@/lib/db";
import { hardNavigate } from "@/lib/navigate";

/** NDPA rights: a copy of everything we hold, and deleting the account. */
export function DataCard() {
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setDownloading(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `InCeipt-my-data-${lagosDate()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Your data is downloading.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't download. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const remove = async () => {
    if (typed.trim().toUpperCase() !== "DELETE") return setError("Type DELETE to confirm.");
    setDeleting(true);
    setError(null);
    try {
      const token = await accessToken();
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't delete your account. Please try again.");
      await signOut().catch(() => {});
      toast.success("Your account and records have been deleted.");
      hardNavigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="font-semibold">Download your data</h2>
          <p className="text-sm text-muted-foreground">
            A copy of everything InCeipt holds about you and the businesses you own: business details, customers, receipts,
            invoices, quotes, payments, expenses and staff. It&apos;s a JSON file you can keep or give to another service.
          </p>
          <Button variant="outline" size="lg" onClick={download} disabled={downloading}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />} Download my data
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardContent className="flex flex-col gap-3">
          <h2 className="font-semibold">Delete your account</h2>
          <p className="text-sm text-muted-foreground">
            Permanently deletes your login and every business you own, with all its records and photos. Any Pro plan is
            stopped first. Businesses where you&apos;re staff keep their records. This can&apos;t be undone, so download your
            data first if you need it.
          </p>
          <Button variant="outline" size="lg" className="border-destructive/40 text-destructive" onClick={() => setOpen(true)}>
            <Trash2 /> Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (deleting) return;
          setOpen(o);
          setTyped("");
          setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account for good?</DialogTitle>
            <DialogDescription>
              All your businesses, customers, receipts, invoices, payments and expenses will be deleted. Type DELETE to confirm.
            </DialogDescription>
          </DialogHeader>
          <Field id="confirm-delete" label="Type DELETE" error={error}>
            <Input
              id="confirm-delete"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setError(null);
              }}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </Field>
          <DialogFooter>
            <Button variant="destructive" size="lg" onClick={remove} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" />} Delete everything
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleting}>
              Keep my account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
