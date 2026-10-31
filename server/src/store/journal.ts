import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SimEvent } from '@hameau/shared';

/** Journal append-only : en mémoire + fichier JSONL (une ligne par événement). */
export class Journal {
  readonly events: SimEvent[] = [];
  private seq = 0;

  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
  }

  append(e: Omit<SimEvent, 'seq' | 'at'>): SimEvent {
    const event: SimEvent = { ...e, seq: ++this.seq, at: new Date().toISOString() };
    this.events.push(event);
    appendFileSync(this.file, JSON.stringify(event) + '\n');
    return event;
  }
}
