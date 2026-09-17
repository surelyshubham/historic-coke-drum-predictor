import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { neonS3, STORAGE_BUCKET } from "@/lib/storage/s3Client";

// GET /api/storage/[id] - Download a specific dataset from Neon Object Storage
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const key = `datasets/${id}.json`;
  try {
    const res = await neonS3.send(new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }));
    const text = await res.Body?.transformToString();
    if (!text) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(JSON.parse(text));
  } catch (err: unknown) {
    const code = (err as { Code?: string; name?: string })?.Code ?? (err as Error)?.name;
    if (code === "NoSuchKey" || code === "NotFound") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[storage/get]", err);
    return NextResponse.json({ error: "Failed to download dataset" }, { status: 500 });
  }
}

// DELETE /api/storage/[id] - Delete a specific dataset from Neon Object Storage
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const key = `datasets/${id}.json`;
  try {
    await neonS3.send(new DeleteObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[storage/delete]", err);
    return NextResponse.json({ error: "Failed to delete dataset" }, { status: 500 });
  }
}