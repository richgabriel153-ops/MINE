"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CallScreen from "@/components/CallScreen";
import PermissionScreen from "@/components/PermissionScreen";
import ReportModal, { type ReportReason } from "@/components/ReportModal";
import Toast from "@/components/Toast";
import { getSessionId, isAgeConfirmed, wasActive } from "@/lib/session";
import { useLinkup } from "@/lib/useLinkup";

export default function ChatPage() {
  const router = useRouter();
  const lk = useLinkup();
  const [allowed, setAllowed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const resumed = useRef(false);

  // 18+ gate: the checkbox on the landing page must have been ticked.
  useEffect(() => {
    if (!isAgeConfirmed()) router.replace("/");
    else setAllowed(true);
  }, [router]);

  // Refreshed mid-chat? Turn the camera back on and rejoin the queue without extra taps.
  const { requestMedia, start } = lk;
  useEffect(() => {
    if (!allowed || resumed.current) return;
    resumed.current = true;
    if (wasActive()) {
      void requestMedia().then((ok) => {
        if (ok) start();
      });
    }
  }, [allowed, requestMedia, start]);

  useEffect(() => {
    if (lk.notice) setToast(lk.notice);
  }, [lk.notice]);

  const submitReport = useCallback(
    (reason: ReportReason, note: string) => {
      const { matchId, partnerSessionId } = lk.currentMatch();
      setReportOpen(false);
      lk.next(); // skip immediately; don't make the reporter wait on the network
      fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporterSessionId: getSessionId(),
          reportedSessionId: partnerSessionId,
          matchId,
          reason,
          note,
        }),
      })
        .then((r) => r.json())
        .then((d) =>
          setToast({ id: Date.now(), text: d.ok ? "Report sent. Thanks for keeping Linkup safe." : "Couldn't send the report. Please try again later." }),
        )
        .catch(() => setToast({ id: Date.now(), text: "Couldn't send the report. Check your connection." }));
    },
    [lk],
  );

  if (!allowed) return <div className="min-h-dvh bg-bg" />;

  const preCall =
    lk.phase === "permission" || lk.phase === "media-pending" || lk.phase === "media-error" || lk.phase === "ready";

  return (
    <>
      {preCall ? (
        <PermissionScreen
          phase={lk.phase}
          mediaError={lk.mediaError}
          stream={lk.localStream}
          online={lk.online}
          micOn={lk.micOn}
          camOn={lk.camOn}
          onAllow={() => void lk.requestMedia()}
          onStart={lk.start}
          onToggleMic={lk.toggleMic}
          onToggleCam={lk.toggleCam}
        />
      ) : (
        <CallScreen
          phase={lk.phase}
          serverStatus={lk.serverStatus}
          online={lk.online}
          localStream={lk.localStream}
          remoteStream={lk.remoteStream}
          messages={lk.messages}
          micOn={lk.micOn}
          camOn={lk.camOn}
          remoteCamOn={lk.remoteCamOn}
          remoteMicOn={lk.remoteMicOn}
          chatReady={lk.chatReady}
          weak={lk.weak}
          leftReason={lk.leftReason}
          onNext={() => lk.next()}
          onStop={lk.stop}
          onStart={lk.start}
          onToggleMic={lk.toggleMic}
          onToggleCam={lk.toggleCam}
          onReport={() => setReportOpen(true)}
          onSend={lk.sendMessage}
        />
      )}
      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitReport} />
      <Toast notice={toast} />
    </>
  );
}
