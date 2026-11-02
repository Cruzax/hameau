import type { SimEvent } from '@hameau/shared';

/** Journal en mémoire seulement : ce qui sert dans le navigateur, où il n'y a pas de disque. */
export class MemoryJournal {
  readonly events: SimEvent[] = [];
  protected seq = 0;

  /** Nouvelle partie : journal vide. */
  restart() {
    this.events.length = 0;
    this.seq = 0;
  }

  /** Reprise d'une partie sauvegardée. */
  load(events: SimEvent[]) {
    this.events.length = 0;
    for (const e of events) this.events.push(e);
    this.seq = events.at(-1)?.seq ?? 0;
  }

  append(e: Omit<SimEvent, 'seq' | 'at'>): SimEvent {
    const line = JSON.stringify({ ...e, seq: ++this.seq, at: new Date().toISOString() });
    // Copie figée : l'export montre l'état au moment de l'événement, pas l'état final du monde.
    const event: SimEvent = JSON.parse(line);
    this.events.push(event);
    this.persist(line);
    return event;
  }

  /** Rien à écrire ici ; le journal sur disque (serveur) surcharge. */
  protected persist(_line: string) {}
}
