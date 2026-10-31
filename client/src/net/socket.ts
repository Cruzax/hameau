import { SERVER_PORT, type ClientToServer, type Message, type ServerToClient } from '@hameau/shared';
import { appendEvents, useHameau } from './store';

export const SERVER_HTTP = `http://${location.hostname}:${SERVER_PORT}`;
const SERVER_WS = `ws://${location.hostname}:${SERVER_PORT}`;

const byId = (ms: Message[]) => Object.fromEntries(ms.map((m) => [m.id, m]));

let reopenNow: (() => void) | null = null;

/** Connexion WebSocket avec reconnexion automatique. Renvoie une fonction de nettoyage. */
export function connect(): () => void {
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const open = () => {
    ws = new WebSocket(SERVER_WS);
    ws.onopen = () =>
      useHameau.setState({
        connected: true,
        send: (cmd: ClientToServer) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(cmd)),
      });
    ws.onclose = () => {
      useHameau.setState({ connected: false, send: () => {} });
      if (!closed) retry = setTimeout(open, 2000);
    };
    ws.onmessage = (ev) => handle(JSON.parse(ev.data) as ServerToClient);
  };

  reopenNow = () => {
    clearTimeout(retry);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    open();
  };

  open();
  return () => {
    closed = true;
    reopenNow = null;
    clearTimeout(retry);
    ws?.close();
  };
}

/** Repart d'un instantané frais du serveur (ex. à la fin d'un replay). */
export function resync() {
  reopenNow?.();
}

function handle(msg: ServerToClient) {
  // Pendant un replay, le direct continue côté serveur mais on ne l'affiche pas.
  if (useHameau.getState().mode === 'replay') return;
  switch (msg.type) {
    case 'snapshot':
      useHameau.setState({ world: msg.world, events: msg.events, bubbles: {}, tickAt: performance.now() });
      break;
    case 'tick':
      useHameau.setState((s) => ({
        world: { ...s.world, clock: msg.clock, messages: byId(msg.messages) },
        tickAt: performance.now(),
      }));
      break;
    case 'events':
      appendEvents(msg.events);
      break;
    case 'patch':
      useHameau.setState((s) => ({ world: { ...s.world, ...msg.world } }));
      break;
  }
}
