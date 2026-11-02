import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MemoryJournal } from './memoryJournal';

/** Journal append-only : en mémoire + fichier JSONL (une ligne par événement). Serveur Node seulement. */
export class Journal extends MemoryJournal {
  constructor(private file: string) {
    super();
    mkdirSync(dirname(file), { recursive: true });
  }

  /** Nouvelle partie : journal vide, dans un nouveau fichier du même dossier. */
  override restart() {
    super.restart();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.file = join(dirname(this.file), `journal-${stamp}.jsonl`);
  }

  protected override persist(line: string) {
    appendFileSync(this.file, line + '\n');
  }
}
