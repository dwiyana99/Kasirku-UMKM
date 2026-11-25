/**
 * Universal S3-Compatible Object Storage Adapter
 * Supports Neon Object Storage, Cloudflare R2, Biznet Gio NEO Object Storage, AWS S3, and MinIO.
 * Reads configuration dynamically from process.env so updates saved via Master Admin Env Vault
 * take effect immediately without rebuilding or restarting the server.
 */

import crypto from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_S3_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB strict cap

export const ALLOWED_UPLOAD_FOLDERS = [
  'products',
  'receipts',
  'landing',
  'logos',
  'proofs',
] as const;

export type AllowedUploadFolder = (typeof ALLOWED_UPLOAD_FOLDERS)[number];

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  forcePathStyle: boolean;
}

export interface UploadFileInput {
  buffer: Buffer;
  fileName?: string;
  contentType: string;
  folder: string;
  tenantId: string;
}

export interface UploadFileResult {
  ok: boolean;
  configured: boolean;
  url: string | null;
  key: string | null;
  storage: 's3' | 'unconfigured';
  message: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  normalizedMime?: AllowedImageMimeType;
  extension?: 'jpg' | 'png' | 'webp';
}

const MIME_TO_EXT: Record<AllowedImageMimeType, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function sanitizeSegment(raw: string, fallback: string, maxLen = 64): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
  return cleaned || fallback;
}

/**
 * Resolves Universal S3 config dynamically from process.env.
 * Supports primary S3_* env variables and backward-compatible R2_* aliases.
 */
export function resolveS3StorageConfig(env: NodeJS.ProcessEnv = process.env): S3StorageConfig | null {
  const r2AccountId = (env.R2_ACCOUNT_ID || '').trim();
  const endpoint = (
    env.S3_ENDPOINT ||
    (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : '')
  ).trim();

  const region = (env.S3_REGION || 'auto').trim() || 'auto';
  const bucket = (env.S3_BUCKET || env.R2_BUCKET_NAME || '').trim();
  const accessKeyId = (env.S3_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.S3_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || '').trim();
  const publicUrl = (env.S3_PUBLIC_URL || env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  // Ensure endpoint is valid https:// or http:// (local MinIO) URL
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
  } catch {
    return null;
  }

  // Biznet Gio NEO Object Storage, MinIO, and custom S3 gateways often require path-style URLs
  const forcePathStyle =
    (env.S3_FORCE_PATH_STYLE || '').trim().toLowerCase() === 'true' ||
    endpoint.includes('biznetgio') ||
    endpoint.includes('neos3') ||
    endpoint.includes('.neo.id') ||
    endpoint.includes('minio') ||
    endpoint.includes('localhost');

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl,
    forcePathStyle,
  };
}

export function isS3StorageConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveS3StorageConfig(env) !== null;
}

/**
 * Inspects file magic bytes to verify the actual binary payload matches
 * JPEG, PNG, or WebP — preventing disguised file uploads.
 */
export function detectImageMimeFromMagicBytes(buffer: Buffer): AllowedImageMimeType | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates MIME type, binary magic bytes, and 3 MB maximum file size.
 */
export function validateUploadFile(params: {
  buffer: Buffer;
  contentType: string;
  maxBytes?: number;
}): FileValidationResult {
  const maxBytes = params.maxBytes ?? MAX_S3_IMAGE_BYTES;
  if (!params.buffer || params.buffer.length === 0) {
    return { valid: false, error: 'File gambar kosong atau tidak terbaca.' };
  }

  if (params.buffer.length > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `Ukuran file melebihi batas maksimal ${maxMb} MB. Kompres gambar terlebih dahulu.`,
    };
  }

  const normalizedDeclared = params.contentType.trim().toLowerCase().split(';')[0];
  const declared = normalizedDeclared === 'image/jpg' ? 'image/jpeg' : normalizedDeclared;

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(declared as AllowedImageMimeType)) {
    return {
      valid: false,
      error: 'Format file tidak didukung. Gunakan gambar JPG, PNG, atau WebP.',
    };
  }

  const detectedMime = detectImageMimeFromMagicBytes(params.buffer);
  if (!detectedMime) {
    return {
      valid: false,
      error: 'Isi file bukan gambar JPG, PNG, atau WebP yang valid.',
    };
  }

  return {
    valid: true,
    normalizedMime: detectedMime,
    extension: MIME_TO_EXT[detectedMime],
  };
}

/**
 * Builds a collision-resistant, path-traversal-proof object key partitioned by tenantId.
 * Format: `${safeTenantId}/${safeFolder}/${timestamp}-${random}.${ext}`
 */
export function buildTenantObjectKey(params: {
  tenantId: string;
  folder: string;
  extension: 'jpg' | 'png' | 'webp';
  nowMs?: number;
  randomHex?: string;
}): string {
  const safeTenantId = sanitizeSegment(params.tenantId, 'tenant-default', 64);
  const rawFolder = sanitizeSegment(params.folder, 'products', 32);
  const safeFolder = ALLOWED_UPLOAD_FOLDERS.includes(rawFolder as AllowedUploadFolder)
    ? rawFolder
    : 'products';
  const timestamp = params.nowMs ?? Date.now();
  const random = params.randomHex ?? crypto.randomBytes(6).toString('hex');
  return `${safeTenantId}/${safeFolder}/${timestamp}-${random}.${params.extension}`;
}

export function buildPublicObjectUrl(config: S3StorageConfig, key: string): string {
  if (config.publicUrl) {
    return `${config.publicUrl}/${key}`;
  }
  const cleanEndpoint = config.endpoint.replace(/\/+$/, '');
  return `${cleanEndpoint}/${encodeURIComponent(config.bucket)}/${key}`;
}

let cachedClientKey = '';
let cachedS3Client: S3Client | null = null;

function getOrCreateS3Client(config: S3StorageConfig): S3Client {
  const fingerprint = `${config.endpoint}|${config.region}|${config.accessKeyId}|${config.secretAccessKey.slice(-6)}|${config.forcePathStyle}`;
  if (cachedS3Client && cachedClientKey === fingerprint) {
    return cachedS3Client;
  }
  cachedS3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedClientKey = fingerprint;
  return cachedS3Client;
}

export function resetS3ClientCache(): void {
  cachedClientKey = '';
  cachedS3Client = null;
}

/**
 * Uploads an image buffer to Universal S3 Object Storage (Neon Storage, Cloudflare R2, Biznet Gio NEO).
 * Returns a clean unconfigured response instead of throwing if S3 env keys have not been configured yet.
 */
export async function uploadFileToStorage(
  input: UploadFileInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UploadFileResult> {
  const validation = validateUploadFile({
    buffer: input.buffer,
    contentType: input.contentType,
  });
  if (!validation.valid || !validation.normalizedMime || !validation.extension) {
    throw new Error(validation.error || 'Validasi file gambar gagal.');
  }

  const config = resolveS3StorageConfig(env);
  if (!config) {
    return {
      ok: false,
      configured: false,
      url: null,
      key: null,
      storage: 'unconfigured',
      message:
        'Object Storage S3 belum dikonfigurasi. Lengkapi S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, dan S3_SECRET_ACCESS_KEY di Vercel atau Master Admin Vault.',
    };
  }

  const key = buildTenantObjectKey({
    tenantId: input.tenantId,
    folder: input.folder,
    extension: validation.extension,
  });

  const client = getOrCreateS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: input.buffer,
      ContentType: validation.normalizedMime,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const url = buildPublicObjectUrl(config, key);
  return {
    ok: true,
    configured: true,
    url,
    key,
    storage: 's3',
    message: 'Gambar berhasil diunggah ke Object Storage.',
  };
}
