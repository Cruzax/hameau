import { SERVER_PORT, type ClientToServer, type Message, type ServerToClient, type SimEvent } from '@hameau/shared';
import { appendEvents, useHameau } from './store';
import type { WorkerReply, WorkerRequest } from './simWorker';

/** Par défaut, la simulation tourne dans le navigateur ; VITE_SERVER=1 pour utiliser le serveur Node local. */
const USE_SERVER = import.meta.env.VITE_SERVER === '1';
const SERVER_HTTP = `http://${location.hostname}:${SERVER_PORT}`;
const SERVER_WS = `ws://${location.hostname}:${SERVER_PORT}`;

const byId = (ms: Message[]) => Object.fromEntries(ms.map((m) => [m.id, m]));

let reopenNow: (() => void) | null = null;

let worker: Worker | null = null;
let journalWaiter: ((events: SimEvent[]) => void) | null = null;

/** Se connecte à la simulation : dans le navigateur (par défaut) ou au serveur Node. Renvoie une fonction de nettoyage. */
export function connect(): () => void {
  return USE_SERVER ? connectServer() : connectWorker();
}

/** La simulation dans un fil du navigateur : pas de serveur, rien à installer. */
function connectWorker(): () => void {
  const w = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
  worker = w;
  w.onmessage = (ev: MessageEvent<WorkerReply>) => {
    const msg = ev.data;
    if (msg.type === 'journal') {
      journalWaiter?.(msg.events);
      journalWaiter = null;
      return;
    }
    if (msg.type === 'save.status') {
      useHameau.setState({ restored: msg.restored });
      return;
    }
    handle(msg);
  };
  useHameau.setState({ connected: true, send: (cmd: ClientToServer) => w.postMessage(cmd satisfies WorkerRequest) });
  // Après un replay : on redemande l'état du monde (la simulation, elle, n'a jamais cessé de tourner).
  reopenNow = () => w.postMessage({ type: 'snapshot.request' } satisfies WorkerRequest);
  // On quitte l'onglet (ou on le cache) : la partie est sauvegardée avant que le navigateur ne coupe tout.
  const saveNow = () => document.visibilityState === 'hidden' && w.postMessage({ type: 'save.request' } satisfies WorkerRequest);
  document.addEventListener('visibilitychange', saveNow);
  window.addEventListener('pagehide', saveNow);
  return () => {
    document.removeEventListener('visibilitychange', saveNow);
    window.removeEventListener('pagehide', saveNow);
    w.terminate();
    worker = null;
    useHameau.setState({ connected: false, send: () => {} });
  };
}

/** Tout le journal de la partie, pour le télécharger. */
export async function fetchJournal(): Promise<SimEvent[]> {
  if (worker) {
    const w = worker;
    return new Promise((resolve) => {
      journalWaiter = resolve;
      w.postMessage({ type: 'journal.request' } satisfies WorkerRequest);
    });
  }
  const res = await fetch(`${SERVER_HTTP}/journal.json`);
  return res.json();
}

/** Connexion WebSocket au serveur Node, avec reconnexion automatique. */
function connectServer(): () => void {
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const open = () => {
    ws = new WebSocket(SERVER_WS);
    ws.onopen = () =>
      useHameau.setState({
        connected: true,
        restored: false,
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
      useHameau.setState({ world: msg.world, events: msg.events, bubbles: {}, ribbons: [], tickAt: performance.now() });
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
