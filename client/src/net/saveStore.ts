import type { SimSave } from '../../../server/src/sim/Sim';

// La partie est gardée dans le navigateur (IndexedDB), sur cet ordinateur seulement.

const DB = 'hameau';
const STORE = 'parties';
const KEY = 'en-cours';

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      db = null;
      reject(req.error);
    };
  });
  return db;
}

/** La partie sauvegardée, ou null s'il n'y en a pas (ou si le navigateur refuse le stockage). */
export async function readSave(): Promise<SimSave | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as SimSave | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Enregistre la partie ; la copie est faite tout de suite, la simulation peut continuer. */
export async function writeSave(save: SimSave): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(save, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Sauvegarde impossible :', err);
  }
}
