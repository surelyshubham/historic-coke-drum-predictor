import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { neonS3, STORAGE_BUCKET } from "@/lib/storage/s3Client";

// POST /api/storage/upload
// Body: { datasetId: string; name: string; data: object }
// Stores the dataset as JSON in Neon Object Storage at datasets/{datasetId}.json
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { datasetId: string; name: string; data: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { datasetId, name, data } = body;
  if (!datasetId || !data) {
    return NextResponse.json({ error: "Missing datasetId or data" }, { status: 400 });
  }

  const key = `datasets/${datasetId}.json`;
  const payload = JSON.stringify({ datasetId, name, savedAt: new Date().toISOString(), data });

  try {
    await neonS3.send(
      new PutObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: key,
        Body: payload,
        ContentType: "application/json",
      })
    );
    return NextResponse.json({ success: true, key });
  } catch (err) {
    console.error("[storage/upload]", err);
    return NextResponse.json({ error: "Failed to upload dataset" }, { status: 500 });
  }
}