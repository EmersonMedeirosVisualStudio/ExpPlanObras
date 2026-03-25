type StoreName = 'meta' | 'outbox' | 'syncResults' | 'presencasDrafts' | 'checklistsDrafts' | 'sstDrafts';

const DB_NAME = 'expplan_offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('syncResults')) db.createObjectStore('syncResults', { keyPath: 'operacaoUuid' });
      if (!db.objectStoreNames.contains('presencasDrafts')) db.createObjectStore('presencasDrafts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('checklistsDrafts')) db.createObjectStore('checklistsDrafts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sstDrafts')) db.createObjectStore('sstDrafts', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStore<T>(storeName: StoreName, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(storeName, 'readonly', (s) => s.get(key));
}

export async function idbPut<T>(storeName: StoreName, value: T): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(storeName, 'readwrite', (s) => s.put(value as any));
}

export async function idbDelete(storeName: StoreName, key: IDBValidKey): Promise<void> {
  await withStore(storeName, 'readwrite', (s) => s.delete(key));
}

export async function idbGetAll<T>(storeName: StoreName): Promise<T[]> {
  return withStore<T[]>(storeName, 'readonly', (s) => s.getAll());
}

