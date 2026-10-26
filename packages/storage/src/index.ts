import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

function storageConfig() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.STORAGE_SECRET_KEY;
  const region = process.env.STORAGE_REGION ?? "auto";
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Private object storage is not configured");
  return {
    client: new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey }
    }),
    photosBucket: process.env.STORAGE_BUCKET_PHOTOS,
    selfiesBucket: process.env.STORAGE_BUCKET_SELFIES
  };
}

export async function normalizeImage(input: Uint8Array): Promise<Buffer> {
  if (input.byteLength === 0 || input.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image size is invalid");
  }
  const result = await sharp(input, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    failOn: "error",
    animated: false
  }).rotate().webp({ quality: 84 }).toBuffer();
  if (result.byteLength > MAX_IMAGE_BYTES) throw new Error("Processed image is too large");
  return result;
}

export async function storeImage(input: Uint8Array, ownerId: string, kind: "photo" | "selfie"): Promise<string> {
  const { client, photosBucket, selfiesBucket } = storageConfig();
  const bucket = kind === "photo" ? photosBucket : selfiesBucket;
  if (!bucket) throw new Error("Storage bucket is not configured");
  const normalized = await normalizeImage(input);
  const key = `${ownerId}/${randomUUID()}.webp`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: normalized,
    ContentType: "image/webp",
    CacheControl: "private, no-store"
  }));
  return key;
}

export async function getImageUrl(key: string, kind: "photo" | "selfie"): Promise<string> {
  const { client, photosBucket, selfiesBucket } = storageConfig();
  const bucket = kind === "photo" ? photosBucket : selfiesBucket;
  if (!bucket) throw new Error("Storage bucket is not configured");
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
}

export async function removeImage(key: string, kind: "photo" | "selfie"): Promise<void> {
  const { client, photosBucket, selfiesBucket } = storageConfig();
  const bucket = kind === "photo" ? photosBucket : selfiesBucket;
  if (!bucket) throw new Error("Storage bucket is not configured");
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
