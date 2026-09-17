import { S3Client } from "@aws-sdk/client-s3";

// Neon Object Storage S3-compatible client.
// Credentials are pulled from env vars injected by `neon env pull` / `neon deploy`.
// forcePathStyle: true is REQUIRED for Neon S3.
// requestChecksumCalculation: "WHEN_REQUIRED" prevents checksum mismatch on presigned URLs.
export const neonS3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-2",
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
});

export const STORAGE_BUCKET = "sigma-coke-drum-datasets";
