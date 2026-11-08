"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SIGNALING_URL } from "./config";
import { getSessionId, setActive } from "./session";

export type Phase =
  | "permission" // explaining why we need camera + mic, waiting for the tap
  | "media-pending" // browser permission prompt is open
  | "media-error" // denied / no device / in use / insecure
  | "ready" // self preview, not searching yet
  | "waiting" // in the queue ("Waiting for someone…")
  | "matching" // paired, WebRTC connecting
  | "connected" // video is flowing
  | "left" // stranger left; offer Next
  | "stopped"; // user pressed Stop

export type ServerStatus = "connecting" | "open" | "reconnecting";
export type LeftReason = "skipped" | "stopped" | "disconnected" | "failed";
export type MediaErrorKind = "denied" | "not-found" | "in-use" | "insecure" | "unknown";

export type ChatMessage = { id: string; from: "me" | "stranger"; text: string };

type DataMsg =
  | { t: "msg"; id: string; text: string }
  | { t: "cam"; on: boolean }
  | { t: "mic"; on: boolean };

const CONNECT_TIMEOUT_MS = 20_000;
const MAX_TEXT = 500;

function mediaErrorKind(err: unknown): MediaErrorKind {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "AbortError") return "in-use";
  return "unknown";
}

let idCounter = 0;
const nextId = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export function useLinkup() {
  const [phase, setPhaseState] = useState<Phase>("permission");
  const [serverStatus, setServerStatus] = useState<ServerStatus>("connecting");
  const [online, setOnline] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState<MediaErrorKind | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteCamOn, setRemoteCamOn] = useState(true);
  const [remoteMicOn, setRemoteMicOn] = useState(true);
  const [chatReady, setChatReady] = useState(false);
  const [weak, setWeak] = useState(false);
  const [leftReason, setLeftReason] = useState<LeftReason | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);

  const phaseRef = useRef<Phase>("permission");
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const matchIdRef = useRef<string | null>(null);
  const partnerSessionRef = useRef<string | null>(null);
  // Survives teardown, so a stranger can still be reported after they left.
  const lastMatchRef = useRef<{ matchId: string | null; partnerSessionId: string | null }>({
    matchId: null,
    partnerSessionId: null,
  });
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const wantSearchRef = useRef(false); // should we be in the queue / in a call?
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const unmounted = useRef(false);
  const micOnRef = useRef(true);
  const camOnRef = useRef(true);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const flash = useCallback((text: string) => setNotice({ id: Date.now(), text }), []);

  // ------------------------------------------------------------------ signaling helpers

  const sendWs = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const sendSignal = useCallback(
    (data: object) => {
      if (matchIdRef.current) sendWs({ type: "signal", matchId: matchIdRef.current, data });
    },
    [sendWs],
  );

  const sendData = useCallback((msg: DataMsg) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  // ------------------------------------------------------------------ peer connection

  const teardownPeer = useCallback(() => {
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = null;
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.ondatachannel = null;
      try {
        pc.close();
      } catch {}
    }
    const dc = dcRef.current;
    dcRef.current = null;
    if (dc) {
      dc.onopen = dc.onclose = dc.onmessage = null;
      try {
        dc.close();
      } catch {}
    }
    matchIdRef.current = null;
    partnerSessionRef.current = null;
    pendingCandidates.current = [];
    setRemoteStream(null);
    setChatReady(false);
    setWeak(false);
    setRemoteCamOn(true);
    setRemoteMicOn(true);
  }, []);

  // `skipRef` lets the peer callbacks call skip() without a dependency cycle.
  const skipRef = useRef<(notice?: string) => void>(() => {});

  const setupDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dcRef.current = dc;
      dc.onopen = () => {
        setChatReady(true);
        sendData({ t: "cam", on: camOnRef.current });
        sendData({ t: "mic", on: micOnRef.current });
      };
      dc.onclose = () => setChatReady(false);
      dc.onmessage = (e) => {
        let msg: DataMsg;
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (msg.t === "msg" && typeof msg.text === "string") {
          const text = msg.text.slice(0, MAX_TEXT);
          setMessages((m) => [...m, { id: nextId(), from: "stranger", text }]);
        } else if (msg.t === "cam") setRemoteCamOn(!!msg.on);
        else if (msg.t === "mic") setRemoteMicOn(!!msg.on);
      };
    },
    [sendData],
  );

  const createPeer = useCallback(
    async (initiator: boolean) => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      pcRef.current = pc;

      const local = localRef.current;
      if (local) for (const track of local.getTracks()) pc.addTrack(track, local);

      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal({ candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        setRemoteStream(stream);
      };
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        const s = pc.connectionState;
        if (s === "connected") {
          if (connectTimer.current) clearTimeout(connectTimer.current);
          connectTimer.current = null;
          setWeak(false);
          if (phaseRef.current === "matching") setPhase("connected");
        } else if (s === "disconnected") {
          setWeak(true); // often recovers on its own (tunnel, network switch)
        } else if (s === "failed") {
          skipRef.current("Couldn't connect to that stranger. Finding someone else…");
        }
      };

      if (initiator) {
        setupDataChannel(pc.createDataChannel("chat", { ordered: true }));
        try {
          const offer = await pc.createOffer();
          if (pcRef.current !== pc) return;
          await pc.setLocalDescription(offer);
          sendSignal({ sdp: pc.localDescription });
        } catch (err) {
          console.error("offer failed", err);
        }
      } else {
        pc.ondatachannel = (e) => setupDataChannel(e.channel);
      }

      connectTimer.current = setTimeout(() => {
        if (pcRef.current === pc && phaseRef.current === "matching") {
          skipRef.current("Connection timed out. Finding someone else…");
        }
      }, CONNECT_TIMEOUT_MS);
    },
    [sendSignal, setPhase, setupDataChannel],
  );

  const handleSignal = useCallback(
    async (data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (pcRef.current !== pc) return;
          for (const c of pendingCandidates.current.splice(0)) {
            await pc.addIceCandidate(c).catch(() => {});
          }
          if (data.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            if (pcRef.current !== pc) return;
            await pc.setLocalDescription(answer);
            sendSignal({ sdp: pc.localDescription });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else pendingCandidates.current.push(data.candidate);
        }
      } catch (err) {
        console.error("signal handling failed", err);
      }
    },
    [sendSignal],
  );

  // ------------------------------------------------------------------ socket

  const connectSocket = useCallback(() => {
    if (unmounted.current) return;
    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(SIGNALING_URL);
    } catch {
      setServerStatus("reconnecting");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", sessionId: getSessionId() }));

    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      switch (msg.type) {
        case "welcome":
          reconnectAttempt.current = 0;
          if (Array.isArray(msg.iceServers)) iceServersRef.current = msg.iceServers as RTCIceServer[];
          if (typeof msg.online === "number") setOnline(msg.online);
          setServerStatus("open");
          if (wantSearchRef.current) {
            ws.send(JSON.stringify({ type: "find" }));
            if (phaseRef.current !== "waiting") setPhase("waiting");
          }
          break;
        case "online":
          if (typeof msg.count === "number") setOnline(msg.count);
          break;
        case "waiting":
          if (wantSearchRef.current && phaseRef.current !== "matching" && phaseRef.current !== "connected") {
            setPhase("waiting");
          }
          break;
        case "matched":
          if (!wantSearchRef.current) {
            // We pressed Stop while the server was pairing us; release the stranger.
            ws.send(JSON.stringify({ type: "stop" }));
            break;
          }
          teardownPeer();
          matchIdRef.current = String(msg.matchId);
          partnerSessionRef.current = typeof msg.partnerSessionId === "string" ? msg.partnerSessionId : null;
          lastMatchRef.current = { matchId: matchIdRef.current, partnerSessionId: partnerSessionRef.current };
          setMessages([]);
          setLeftReason(null);
          setPhase("matching");
          void createPeer(!!msg.initiator);
          break;
        case "signal":
          if (msg.matchId === matchIdRef.current) void handleSignal(msg.data as never);
          break;
        case "partner-left":
          if (msg.matchId && msg.matchId === matchIdRef.current) {
            teardownPeer();
            wantSearchRef.current = false;
            setLeftReason((msg.reason as LeftReason) || "disconnected");
            setPhase("left");
          }
          break;
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (unmounted.current) return;
      // The server has already told our stranger we're gone; end the call on our side too.
      if (pcRef.current) {
        teardownPeer();
        flash("Lost connection to the server. Reconnecting…");
      }
      if (phaseRef.current === "matching" || phaseRef.current === "connected") {
        setPhase(wantSearchRef.current ? "waiting" : "left");
      }
      setServerStatus("reconnecting");
      const delay = Math.min(10_000, 1000 * 2 ** reconnectAttempt.current++);
      reconnectTimer.current = setTimeout(connectSocket, delay);
    };
  }, [createPeer, flash, handleSignal, setPhase, teardownPeer]);

  // ------------------------------------------------------------------ public actions

  const requestMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError(window.isSecureContext ? "unknown" : "insecure");
      setPhase("media-error");
      return false;
    }
    setPhase("media-pending");
    setMediaError(null);
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "OverconstrainedError") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio, video: true });
        } catch (err2) {
          setMediaError(mediaErrorKind(err2));
          setPhase("media-error");
          return false;
        }
      } else {
        setMediaError(mediaErrorKind(err));
        setPhase("media-error");
        return false;
      }
    }
    if (unmounted.current) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    localRef.current = stream;
    stream.getAudioTracks().forEach((t) => (t.enabled = micOnRef.current));
    stream.getVideoTracks().forEach((t) => (t.enabled = camOnRef.current));
    setLocalStream(stream);
    setPhase("ready");
    return true;
  }, [setPhase]);

  const start = useCallback(() => {
    wantSearchRef.current = true;
    setActive(true);
    setLeftReason(null);
    setMessages([]);
    setPhase("waiting");
    if (!sendWs({ type: "find" })) connectSocket(); // welcome handler sends find
  }, [connectSocket, sendWs, setPhase]);

  const next = useCallback(
    (noticeText?: string) => {
      teardownPeer();
      wantSearchRef.current = true;
      setActive(true);
      setLeftReason(null);
      setMessages([]);
      setPhase("waiting");
      if (noticeText) flash(noticeText);
      if (!sendWs({ type: "next" })) connectSocket();
    },
    [connectSocket, flash, sendWs, setPhase, teardownPeer],
  );
  skipRef.current = next;

  const stop = useCallback(() => {
    teardownPeer();
    wantSearchRef.current = false;
    setActive(false);
    sendWs({ type: "stop" });
    setPhase("stopped");
  }, [sendWs, setPhase, teardownPeer]);

  const toggleMic = useCallback(() => {
    const on = !micOnRef.current;
    micOnRef.current = on;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = on));
    setMicOn(on);
    sendData({ t: "mic", on });
  }, [sendData]);

  const toggleCam = useCallback(() => {
    const on = !camOnRef.current;
    camOnRef.current = on;
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = on));
    setCamOn(on);
    sendData({ t: "cam", on });
  }, [sendData]);

  const sendMessage = useCallback(
    (raw: string) => {
      const text = raw.trim().slice(0, MAX_TEXT);
      if (!text) return false;
      const id = nextId();
      if (!sendData({ t: "msg", id, text })) return false;
      setMessages((m) => [...m, { id, from: "me", text }]);
      return true;
    },
    [sendData],
  );

  /** The stranger we're talking to (or just talked to), for reports. */
  const currentMatch = useCallback(() => ({ ...lastMatchRef.current }), []);

  // ------------------------------------------------------------------ lifecycle

  useEffect(() => {
    unmounted.current = false;
    connectSocket();

    // Closing the socket on refresh / tab close tells the stranger immediately instead of after
    // the server's heartbeat timeout.
    const onPageHide = () => {
      try {
        wsRef.current?.close();
      } catch {}
    };
    window.addEventListener("pagehide", onPageHide);

    // Coming back online: reconnect right away instead of waiting for the backoff.
    const onOnline = () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectAttempt.current = 0;
      connectSocket();
    };
    window.addEventListener("online", onOnline);

    return () => {
      unmounted.current = true;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      teardownPeer();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
          ws.close();
        } catch {}
      }
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
    };
  }, [connectSocket, teardownPeer]);

  return {
    phase,
    serverStatus,
    online,
    mediaError,
    localStream,
    remoteStream,
    messages,
    micOn,
    camOn,
    remoteCamOn,
    remoteMicOn,
    chatReady,
    weak,
    leftReason,
    notice,
    requestMedia,
    start,
    next,
    stop,
    toggleMic,
    toggleCam,
    sendMessage,
    currentMatch,
  };
}
