"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, CheckCircle2, CloudUpload, Loader2, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { billingSummary } from "@/lib/billing";
import { accessToken, friendlyError, isCloudConfigured } from "@/lib/cloud/client";
import { createBusiness, importLocal, myBusinesses, type MyBusiness } from "@/lib/cloud/repo";
import { getSignedInEmail, setActiveBusinessId, signOut } from "@/lib/cloud/session";
import * as local from "@/lib/local-db";
import { hardNavigate } from "@/lib/navigate";

type State =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "signedOut" }
  | { kind: "choose"; email: string; businesses: MyBusiness[] }
  | { kind: "setup"; email: string; localCount: number; legacyPro: boolean; businessName: string };

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export function AccountPanel() {
  const { access } = useAccess();
  const next = safeNext(useSearchParams().get("next"));
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!access) return;
    if (access.mode === "cloud") return; // signed in with a business: shown below
    let active = true;
    (async () => {
      let s: State;
      if (!isCloudConfigured()) s = { kind: "off" };
      else {
        const email = await getSignedInEmail();
        if (!email) s = { kind: "signedOut" };
        else {
          const businesses = await myBusinesses().catch(() => [] as MyBusiness[]);
          if (businesses.length > 0) s = { kind: "choose", email, businesses };
          else {
            const [docs, profile, pro] = await Promise.all([local.listDocuments(), local.getProfile(), local.getProStatus()]);
            s = { kind: "setup", email, localCount: docs.length, legacyPro: pro.unlocked, businessName: profile.name };
          }
        }
      }
      if (active) setState(s);
    })();
    return () => {
      active = false;
    };
  }, [access]);

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  if (access.mode === "cloud" && access.cloud) return <SignedIn />;

  switch (state.kind) {
    case "loading":
      return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
    case "off":
      return (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            InCeipt accounts aren&apos;t switched on yet. Your records are saved on this phone. Use Backup to keep a copy.
          </CardContent>
        </Card>
      );
    case "signedOut":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Create your free InCeipt account</CardTitle>
            <CardDescription>
              Keep your records safe online, use them on any phone, and unlock Pro: subscriptions, staff accounts, Pay Now
              links, expenses and profit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg" className="w-full">
              <Link href={`/signin?next=${encodeURIComponent(next)}`}>
                <UserRound /> Sign in or create account
              </Link>
            </Button>
          </CardContent>
        </Card>
      );
    case "choose":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Signed in as {state.email}. Choose a business:</p>
          {state.businesses.map((b) => (
            <button
              key={b.business_id}
              type="button"
              onClick={() => {
                setActiveBusinessId(b.business_id);
                hardNavigate(next);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-xs"
            >
              <Building2 className="size-6 text-primary" />
              <span className="flex-1">
                <span className="block font-semibold">{b.name || "Unnamed business"}</span>
                <span className="block text-sm text-muted-foreground">
                  {b.role === "owner" ? "Owner" : "Staff"}
                  {b.is_pro ? " · Pro" : ""}
                </span>
              </span>
            </button>
          ))}
          <SignOutButton />
        </div>
      );
    case "setup":
      return <SetupBusiness {...state} next={next} />;
  }
}

function SetupBusiness({
  email,
  localCount,
  legacyPro,
  businessName,
  next,
}: {
  email: string;
  localCount: number;
  legacyPro: boolean;
  businessName: string;
  next: string;
}) {
  const [ownerName, setOwnerName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function setup() {
    setBusy(true);
    try {
      const [profile, docs, counters] = await Promise.all([local.getProfile(), local.listDocuments(), local.getCounters()]);
      const bid = await createBusiness(profile, ownerName.trim());
      if (docs.length) await importLocal(bid, docs, counters);
      if (code.trim()) {
        const token = await accessToken();
        const res = await fetch("/api/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ code, businessId: bid }),
        });
        if (!res.ok) toast.error("Your account is ready, but that unlock code didn't work. You can add it later on the Pro page.");
      }
      setActiveBusinessId(bid);
      toast.success("Your InCeipt account is ready");
      hardNavigate(next);
    } catch (err) {
      toast.error(friendlyError(err).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your business account</CardTitle>
        <CardDescription>Signed in as {email}. You&apos;ll be the owner.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-3 rounded-xl bg-secondary p-3 text-sm">
          <CloudUpload className="size-5 shrink-0 text-primary" />
          <span>
            {localCount > 0 ? (
              <>
                We&apos;ll copy <strong>{localCount}</strong> {localCount === 1 ? "record" : "records"}
                {businessName && <> and the details of <strong>{businessName}</strong></>} from this phone into your
                account. They stay on this phone too.
              </>
            ) : (
              <>Your business details from this phone will be copied into your account.</>
            )}
          </span>
        </div>
        <Field id="owner-name" label="Your name" optional hint="Shown to staff and in the activity log.">
          <Input id="owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Ada Obi" />
        </Field>
        {legacyPro && (
          <Field
            id="legacy-code"
            label="Your Pro unlock code"
            optional
            hint="You unlocked Pro on this phone with a code. Enter it again to keep Pro on your account."
          >
            <Input
              id="legacy-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              className="uppercase"
            />
          </Field>
        )}
        <Button size="lg" onClick={setup} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Create my business account
        </Button>
        <SignOutButton />
      </CardContent>
    </Card>
  );
}

function SignedIn() {
  const { access } = useAccess();
  if (!access?.cloud) return null;
  const billing = billingSummary(access);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary">
              <UserRound className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{access.cloud.email}</div>
              <div className="text-sm text-muted-foreground">{access.role === "owner" ? "Owner" : "Staff"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm">
            <CheckCircle2 className="size-5 shrink-0 text-primary" />
            Your records are saved in your InCeipt account.
          </div>
        </CardContent>
      </Card>
      {access.role === "owner" && (
        <Link href="/pro" className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-xs">
          <span>
            <span className="block font-semibold">Plan: {billing.title}</span>
            <span className="block text-sm text-muted-foreground">{billing.detail}</span>
          </span>
          <span className="text-sm font-semibold text-primary">Manage</span>
        </Link>
      )}
      <Button
        variant="outline"
        onClick={() => {
          setActiveBusinessId(null);
          hardNavigate("/account");
        }}
      >
        <Building2 /> Switch business
      </Button>
      <SignOutButton />
    </div>
  );
}

function SignOutButton() {
  return (
    <Button
      variant="ghost"
      className="text-destructive"
      onClick={async () => {
        await signOut();
        toast.success("Signed out. Records on this phone are still here.");
        hardNavigate("/home");
      }}
    >
      <LogOut /> Sign out
    </Button>
  );
}
