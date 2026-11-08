/** WebSocket URL of the signaling server, e.g. wss://linkup-server.onrender.com */
export const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || "ws://localhost:8080";

/** HTTP base of the same server, used for the online counter. */
export const SIGNALING_HTTP_URL = SIGNALING_URL.replace(/^ws(s?):\/\//, "http$1://").replace(/\/$/, "");
