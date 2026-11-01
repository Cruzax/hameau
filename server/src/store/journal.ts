import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SimEvent } from '@hameau/shared';

/** Journal append-only : en mémoire + fichier JSONL (une ligne par événement). */
export class Journal {
  readonly events: SimEvent[] = [];
  private seq = 0;

  constructor(private file: string) {
    mkdirSync(dirname(file), { recursive: true });
  }

  /** Nouvelle partie : journal vide, dans un nouveau fichier du même dossier. */
  restart() {
    this.events.length = 0;
    this.seq = 0;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.file = join(dirname(this.file), `journal-${stamp}.jsonl`);
  }

  append(e: Omit<SimEvent, 'seq' | 'at'>): SimEvent {
    const line = JSON.stringify({ ...e, seq: ++this.seq, at: new Date().toISOString() });
    // Copie figée : l'export montre l'état au moment de l'événement, pas l'état final du monde.
    const event: SimEvent = JSON.parse(line);
    this.events.push(event);
    appendFileSync(this.file, line + '\n');
    return event;
  }
}
