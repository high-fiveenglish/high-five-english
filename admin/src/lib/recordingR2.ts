// Private Cloudflare R2 storage for lesson recordings. This module is deliberately separate from r2.ts (the PUBLIC teacher photo/voice
// bucket): it reads only the R2_RECORDINGS_* variables, never builds a public URL, and never imports r2.ts — so a recording can not end
// up in, or be served from, the public bucket. admin/scripts/test-recordingR2Isolation.ts enforces this on the source code.
//
// Nothing here runs at import time: the client is created on first use, so a missing configuration is a "not configured" answer
// (isRecordingStorageConfigured) and not a crash while the module loads (Netlify functions import this file too).
//
// Access model: the bucket is private. The browser gets a short-lived URL that can write ONE object key (the key and Content-Type are signed);
// AssemblyAI gets a short-lived URL that can read ONE object key. Nobody else ever receives a URL or a credential.
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface RecordingR2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** The recording storage as the rest of the code sees it (also what the tests fake). */
export interface RecordingStore {
  /** A URL the browser may PUT to: writes exactly `key`, with exactly `contentType`, until it expires. */
  presignUpload(key: string, contentType: string, ttlSec: number): Promise<string>;
  /** A URL that reads exactly `key` until it expires. Only ever handed to AssemblyAI. */
  presignDownload(key: string, ttlSec: number): Promise<string>;
  /** Size and Content-Type of the stored object, or null when it does not exist. Other failures throw. */
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  /** Deletes the object. Deleting an object that is already gone is not an error. */
  remove(key: string): Promise<void>;
}

const REQUIRED = ["R2_RECORDINGS_ENDPOINT", "R2_RECORDINGS_ACCESS_KEY_ID", "R2_RECORDINGS_SECRET_ACCESS_KEY", "R2_RECORDINGS_BUCKET_NAME"] as const;

/** The configuration from the environment, or null when any of the four variables is missing or malformed. Values are never logged. */
export function readRecordingR2Config(env: Record<string, string | undefined> = process.env): RecordingR2Config | null {
  const [endpoint, accessKeyId, secretAccessKey, bucket] = REQUIRED.map((name) => env[name]?.trim());
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || (url.pathname !== "/" && url.pathname !== "")) return null; // the account endpoint, without a bucket path
  } catch {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  return { endpoint: endpoint.replace(/\/$/, ""), accessKeyId, secretAccessKey, bucket };
}

export function isRecordingStorageConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readRecordingR2Config(env) !== null;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

/** Builds a store for an explicit configuration (tests use dummy credentials: presigning is offline, nothing is sent anywhere). */
export function createRecordingStore(config: RecordingR2Config): RecordingStore {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // R2 does not take the SDK's default CRC32 checksum parameters on presigned URLs: without these two settings the signed URL would
    // demand headers a browser PUT does not send.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    presignUpload: (key, contentType, ttlSec) => getSignedUrl(client, new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }), {
        expiresIn: ttlSec,
        // the SDK leaves Content-Type OUT of the signature of a presigned PUT unless asked: sign it, so the upload must carry exactly this type
        signableHeaders: new Set(["content-type"]),
      }),
    presignDownload: (key, ttlSec) => getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn: ttlSec }),
    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

let cached: { signature: string; store: RecordingStore } | null = null;

/** The store for the current environment, created on first use; null when the recording bucket is not configured. */
export function getRecordingStore(env: Record<string, string | undefined> = process.env): RecordingStore | null {
  const config = readRecordingR2Config(env);
  if (!config) return null;
  const signature = `${config.endpoint}|${config.bucket}|${config.accessKeyId}|${config.secretAccessKey.length}`;
  if (!cached || cached.signature !== signature) cached = { signature, store: createRecordingStore(config) };
  return cached.store;
}
