/**
 * messageBuffer.ts
 *
 * Solves the React mount race condition:
 *
 * The iframe sends KUMII_READY the instant main.tsx loads.
 * Lovable may reply with KUMII_SESSION before React's useEffect has run
 * and registered a message listener. Without buffering, that reply is lost
 * and the user sees "Session not received" after 20 s.
 *
 * This module installs a single window.addEventListener('message') at
 * module-evaluation time (before React mounts). All messages are buffered
 * until App.tsx calls registerAppHandler(), at which point buffered messages
 * are replayed synchronously and all future messages are forwarded directly.
 */

type Handler = (e: MessageEvent) => void;

const buffer: MessageEvent[] = [];
let liveHandler: Handler | null = null;

// Installed immediately when this module is imported (before React mounts)
window.addEventListener('message', (e: MessageEvent) => {
  if (liveHandler) {
    liveHandler(e);
  } else {
    buffer.push(e);
  }
});

/**
 * Called by App.tsx inside useEffect to register its handler.
 * Any messages that arrived before mount are replayed immediately.
 * Returns an unregister function to call on cleanup.
 */
export function registerAppHandler(handler: Handler): () => void {
  liveHandler = handler;

  // Drain buffered messages synchronously
  while (buffer.length > 0) {
    handler(buffer.shift()!);
  }

  return () => {
    liveHandler = null;
  };
}
