"use client";
/**
 * Cloud sync utilities for the Coke Drum Vault.
 * Wraps the /api/storage/* API routes and exposes simple
 * upload / download / list / delete helpers that work from the browser.
 */

import { VaultDataset, VaultDatasetSummary } from "./datasetVault";

export interface CloudDatasetSummary {
  id: string;
  name: string;
  savedAt: string;
  key: string;
  size?: number;
}

export interface CloudSyncResult {
  success: boolean;
  error?: string;
}

/** Upload a dataset to Neon Object Storage (fire-and-forget from browser). */
export async function uploadDatasetToCloud(dataset: VaultDataset): Promise<CloudSyncResult> {
  try {
    const res = await fetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetId: dataset.id,
        name: dataset.name,
        data: dataset,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    console.warn("[cloudSync] upload error:", err);
    return { success: false, error: String(err) };
  }
}

/** List all datasets stored in Neon Object Storage. */
export async function listCloudDatasets(): Promise<CloudDatasetSummary[]> {
  try {
    const res = await fetch("/api/storage/list");
    if (!res.ok) return [];
    const json = await res.json();
    return json.datasets ?? [];
  } catch {
    return [];
  }
}

/** Download a specific dataset from Neon Object Storage. */
export async function downloadDatasetFromCloud(id: string): Promise<VaultDataset | null> {
  try {
    const res = await fetch(`/api/storage/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const json = await res.json();
    // The API wraps dataset inside { datasetId, name, savedAt, data }
    return (json.data ?? json) as VaultDataset;
  } catch {
    return null;
  }
}

/** Delete a dataset from Neon Object Storage. */
export async function deleteDatasetFromCloud(id: string): Promise<CloudSyncResult> {
  try {
    const res = await fetch(`/api/storage/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** Convert a CloudDatasetSummary to a VaultDatasetSummary (for display in UI). */
export function cloudToVaultSummary(c: CloudDatasetSummary): VaultDatasetSummary {
  return {
    id: c.id,
    name: c.name,
    savedAt: c.savedAt,
    availableDrums: [],
    totalIndications: 0,
    campaignCount: 0,
    isActive: false,
  };
}