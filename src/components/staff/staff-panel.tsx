"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle, Share2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getProfile } from "@/lib/db";
import { inviteStaff, listMembers, setStaffActive, type Member } from "@/lib/cloud/repo";

const STATUS_LABEL: Record<Member["status"], string> = { invited: "Invited", active: "Active", deactivated: "Access off" };

function inviteMessage(name: string, business: string, email: string, origin: string): string {
  const hello = name ? `Hi ${name.split(/\s+/)[0]},` : "Hi,";
  return `${hello} I've added you to ${business || "our business"} on InCeipt so you can make receipts and invoices.\n\nOpen ${origin}/signin?email=${encodeURIComponent(email)} and sign in with ${email}. You'll get a code by email.`;
}

export function StaffPanel() {
  const { access, showUpgrade } = useAccess();
  const businessId = access?.cloud?.businessId;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<{ name: string; email: string } | null>(null);
  const [confirm, setConfirm] = useState<Member | null>(null);
  const [businessName, setBusinessName] = useState("");

  const load = useCallback(async () => {
    if (!businessId) return;
    setMembers(await listMembers(businessId));
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !access?.can.manageStaff) return;
    let active = true;
    Promise.all([listMembers(businessId), getProfile()])
      .then(([m, p]) => {
        if (!active) return;
        setMembers(m);
        setBusinessName(p.name);
      })
      .catch((e) => toast.error(e.message));
    return () => {
      active = false;
    };
  }, [businessId, access?.can.manageStaff]);

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (access.role !== "owner") return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner can manage staff.</p>;
  if (!access.can.manageStaff)
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">Staff accounts are part of InCeipt Pro.</p>
          <Button onClick={() => showUpgrade("Staff accounts")}>See Pro</Button>
        </CardContent>
      </Card>
    );

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      const clean = email.trim().toLowerCase();
      await inviteStaff(businessId, clean, name.trim());
      await load();
      setShareFor({ name: name.trim(), email: clean });
      setEmail("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't invite. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const message = shareFor ? inviteMessage(shareFor.name, businessName, shareFor.email, origin) : "";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Invite a staff member</CardTitle>
          <CardDescription>
            Staff can make receipts, invoices and quotes and record payments. They can&apos;t edit or delete past records,
            see your sales totals, profit or expenses, or change settings and billing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={invite} noValidate className="flex flex-col gap-3">
            <Field id="staff-name" label="Their name" optional>
              <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sade" />
            </Field>
            <Field id="staff-email" label="Their email" error={error}>
              <Input
                id="staff-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="staff@example.com"
                aria-invalid={!!error || undefined}
              />
            </Field>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Invite
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="size-5" /> Your team
        </h2>
        {members === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{m.name || m.email}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {m.role === "owner" ? "Owner" : `Staff · ${STATUS_LABEL[m.status]}`}
                  {m.name ? ` · ${m.email}` : ""}
                </div>
              </div>
              {m.role === "staff" &&
                (m.status === "deactivated" ? (
                  <Button size="sm" variant="outline" onClick={() => setConfirm(m)}>
                    Turn on
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    {m.status === "invited" && (
                      <Button size="sm" variant="ghost" aria-label="Send invite again" onClick={() => setShareFor({ name: m.name, email: m.email })}>
                        <Share2 />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm(m)}>
                      Turn off
                    </Button>
                  </div>
                ))}
            </div>
          ))
        )}
      </section>

      <Dialog open={shareFor !== null} onOpenChange={(o) => !o && setShareFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send them the invite</DialogTitle>
            <DialogDescription>They join by signing in with {shareFor?.email}. Send this message so they know how:</DialogDescription>
          </DialogHeader>
          <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-line">{message}</p>
          <DialogFooter>
            <Button asChild size="lg" className="bg-[#1fa855] hover:bg-[#1b9a4d]">
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> Send on WhatsApp
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (navigator.share) await navigator.share({ text: message }).catch(() => undefined);
                else {
                  await navigator.clipboard.writeText(message).catch(() => undefined);
                  toast.success("Copied");
                }
              }}
            >
              <Share2 /> Share another way
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirm.status === "deactivated" ? "Turn access back on" : "Turn off access"} for {confirm.name || confirm.email}?
                </DialogTitle>
                <DialogDescription>
                  {confirm.status === "deactivated"
                    ? "They'll be able to sign in and make receipts again."
                    : "They'll be signed out of your business straight away. Everything they made stays in your records."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  size="lg"
                  variant={confirm.status === "deactivated" ? "default" : "destructive"}
                  onClick={async () => {
                    try {
                      await setStaffActive(confirm.id, confirm.status === "deactivated");
                      await load();
                      toast.success("Done");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Couldn't change access.");
                    }
                    setConfirm(null);
                  }}
                >
                  {confirm.status === "deactivated" ? "Turn on" : "Turn off"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
