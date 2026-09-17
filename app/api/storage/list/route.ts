import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { neonS3, STORAGE_BUCKET } from "@/lib/storage/s3Client";

export interface CloudDatasetSummary {
  id: string;
  name: string;
  savedAt: string;
  key: string;
  size?: number;
}

// GET /api/storage/list - List all datasets stored in Neon Object Storage
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await neonS3.send(
      new ListObjectsV2Command({ Bucket: STORAGE_BUCKET, Prefix: "datasets/" })
    );

    const items: CloudDatasetSummary[] = (res.Contents ?? []).map((obj) => {
      const key = obj.Key ?? "";
      // key format: datasets/{id}.json
      const id = key.replace("datasets/", "").replace(".json", "");
      return {
        id,
        name: id, // will be enriched client-side after fetch if needed
        savedAt: obj.LastModified?.toISOString() ?? new Date().toISOString(),
        key,
        size: obj.Size,
      };
    });

    // Newest first
    items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

    return NextResponse.json({ datasets: items });
  } catch (err) {
    console.error("[storage/list]", err);
    return NextResponse.json({ error: "Failed to list datasets" }, { status: 500 });
  }
}