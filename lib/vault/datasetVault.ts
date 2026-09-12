import { MatrixParseResult } from "@/lib/import/matrixParser";
import { RepairZone } from "@/types/repair";

export interface VaultDataset {
  id: string;
  name: string;
  savedAt: string;
  availableDrums: string[];
  weldsByDrum: Record<string, string[]>;
  campaigns: Array<{ key: string; label: string; date: string }>;
  totalIndications: number;
  matrixResult: MatrixParseResult;
  activeDrum?: string;
  activeWeld?: string;
  repairZones?: RepairZone[];
}

export interface VaultDatasetSummary {
  id: string;
  name: string;
  savedAt: string;
  availableDrums: string[];
  totalIndications: number;
  campaignCount: number;
  isActive: boolean;
}

const DB_NAME = "CokeDrum_Vault_DB";
const DB_VERSION = 1;
const DATASETS_STORE = "datasets";
const META_STORE = "active_meta";
const ACTIVE_KEY = "active_dataset_id";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported in this browser environment."));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DATASETS_STORE)) {
        db.createObjectStore(DATASETS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open Coke Drum Vault database."));
  });
}

/**
 * Save or update an inspection dataset in the browser's persistent Vault.
 */
export async function saveDatasetToVault(dataset: VaultDataset): Promise<string> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DATASETS_STORE, META_STORE], "readwrite");
    const datasetsStore = tx.objectStore(DATASETS_STORE);
    const metaStore = tx.objectStore(META_STORE);

    datasetsStore.put(dataset);
    metaStore.put({ key: ACTIVE_KEY, value: dataset.id });

    tx.oncomplete = () => {
      db.close();
      resolve(dataset.id);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to store dataset into Vault."));
    };
  });
}

/**
 * Retrieve a specific dataset by its ID from the Vault.
 */
export async function getDatasetFromVault(id: string): Promise<VaultDataset | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATASETS_STORE, "readonly");
    const store = tx.objectStore(DATASETS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error || new Error(`Failed to retrieve dataset ${id} from Vault.`));
    };
  });
}

/**
 * Get the currently active dataset ID.
 */
export async function getActiveVaultDatasetId(): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const store = tx.objectStore(META_STORE);
    const request = store.get(ACTIVE_KEY);

    request.onsuccess = () => {
      db.close();
      resolve(request.result?.value || null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error || new Error("Failed to fetch active dataset ID from Vault."));
    };
  });
}

/**
 * Set the currently active dataset ID.
 */
export async function setActiveVaultDatasetId(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    const store = tx.objectStore(META_STORE);
    store.put({ key: ACTIVE_KEY, value: id });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to update active dataset ID in Vault."));
    };
  });
}

/**
 * Retrieve the currently active Vault dataset (or the most recently saved one).
 */
export async function getActiveVaultDataset(): Promise<VaultDataset | null> {
  try {
    const activeId = await getActiveVaultDatasetId();
    if (activeId) {
      const active = await getDatasetFromVault(activeId);
      if (active) return active;
    }

    // Fallback to the latest saved dataset if none marked active
    const all = await getAllVaultDatasets();
    if (all.length > 0) {
      const latest = await getDatasetFromVault(all[0].id);
      if (latest) {
        await setActiveVaultDatasetId(latest.id);
        return latest;
      }
    }

    return null;
  } catch (err) {
    console.warn("Vault access notice (non-fatal):", err);
    return null;
  }
}

/**
 * List all datasets stored in the Vault with lightweight summaries.
 */
export async function getAllVaultDatasets(): Promise<VaultDatasetSummary[]> {
  const db = await openDb();
  const activeId = await getActiveVaultDatasetId();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATASETS_STORE, "readonly");
    const store = tx.objectStore(DATASETS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      const records: VaultDataset[] = request.result || [];
      const summaries: VaultDatasetSummary[] = records.map((r) => ({
        id: r.id,
        name: r.name,
        savedAt: r.savedAt,
        availableDrums: r.availableDrums || [],
        totalIndications: r.totalIndications || (r.matrixResult?.physicalIndications?.length ?? 0),
        campaignCount: r.campaigns?.length || (r.matrixResult?.campaigns?.length ?? 0),
        isActive: r.id === activeId,
      }));

      // Sort newest first
      summaries.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      resolve(summaries);
    };

    request.onerror = () => {
      db.close();
      reject(request.error || new Error("Failed to load Vault datasets."));
    };
  });
}

/**
 * Delete a dataset from the Vault.
 */
export async function deleteDatasetFromVault(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DATASETS_STORE, META_STORE], "readwrite");
    const datasetsStore = tx.objectStore(DATASETS_STORE);
    const metaStore = tx.objectStore(META_STORE);

    datasetsStore.delete(id);

    // If deleting active dataset, clear active key
    const activeReq = metaStore.get(ACTIVE_KEY);
    activeReq.onsuccess = () => {
      if (activeReq.result?.value === id) {
        metaStore.delete(ACTIVE_KEY);
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error(`Failed to delete dataset ${id} from Vault.`));
    };
  });
}