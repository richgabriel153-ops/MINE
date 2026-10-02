"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isIOS } from "@/lib/device";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noSubscribe = () => () => {};

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * "Install app" button. Android Chrome: opens the real install prompt.
 * iPhone: explains Share → Add to Home Screen. Hidden once installed or where not possible.
 */
export function InstallButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHelp, setIosHelp] = useState(false);
  const standalone = useSyncExternalStore(noSubscribe, isStandalone, () => true);
  const ios = useSyncExternalStore(noSubscribe, isIOS, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || (!deferred && !ios)) return null;

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className={className ?? "h-16 text-lg"}
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          } else {
            setIosHelp(true);
          }
        }}
      >
        <Download /> Install app
      </Button>
      <Dialog open={iosHelp} onOpenChange={setIosHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add InCeipt to your home screen</DialogTitle>
            <DialogDescription asChild>
              <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-base text-foreground">
                <li>
                  Tap the <Share className="inline size-5 align-text-bottom" /> <strong>Share</strong> button at the
                  bottom of Safari.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong>. InCeipt opens like an app, even without internet.
                </li>
              </ol>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
