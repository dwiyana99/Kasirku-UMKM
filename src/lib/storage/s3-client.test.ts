import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_S3_IMAGE_BYTES,
  buildPublicObjectUrl,
  buildTenantObjectKey,
  detectImageMimeFromMagicBytes,
  isS3StorageConfigured,
  resolveS3StorageConfig,
  uploadFileToStorage,
  validateUploadFile,
} from './s3-client.ts';

// Minimal valid binary headers for JPEG, PNG, and WebP
const FAKE_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
]);
const FAKE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
]);
const FAKE_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);

describe('Universal S3 Storage Adapter — validation & key partitioning', () => {
  it('detects JPEG, PNG, and WebP magic bytes accurately and rejects disguised scripts', () => {
    assert.equal(detectImageMimeFromMagicBytes(FAKE_JPEG), 'image/jpeg');
    assert.equal(detectImageMimeFromMagicBytes(FAKE_PNG), 'image/png');
    assert.equal(detectImageMimeFromMagicBytes(FAKE_WEBP), 'image/webp');
    assert.equal(
      detectImageMimeFromMagicBytes(Buffer.from('<svg><script>alert(1)</script></svg>')),
      null,
    );
  });

  it('rejects unsupported MIME types, spoofed binaries, and files larger than 3 MB', () => {
    const svgCheck = validateUploadFile({
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      contentType: 'image/svg+xml',
    });
    assert.equal(svgCheck.valid, false);

    const spoofedCheck = validateUploadFile({
      buffer: Buffer.from('not-actually-a-png-file-at-all-12345'),
      contentType: 'image/png',
    });
    assert.equal(spoofedCheck.valid, false);

    const oversized = Buffer.alloc(MAX_S3_IMAGE_BYTES + 10);
    FAKE_JPEG.copy(oversized);
    const sizeCheck = validateUploadFile({
      buffer: oversized,
      contentType: 'image/jpeg',
    });
    assert.equal(sizeCheck.valid, false);

    const validCheck = validateUploadFile({
      buffer: FAKE_PNG,
      contentType: 'image/png',
    });
    assert.equal(validCheck.valid, true);
    assert.equal(validCheck.extension, 'png');
  });

  it('sanitizes tenantId and folder to prevent path traversal', () => {
    const key = buildTenantObjectKey({
      tenantId: '../../etc/passwd',
      folder: '../secret',
      extension: 'webp',
      nowMs: 1700000000000,
      randomHex: 'a1b2c3',
    });
    assert.equal(key, 'etc-passwd/products/1700000000000-a1b2c3.webp');
    assert.equal(key.includes('..'), false);
  });

  it('resolves S3_* config and falls back to R2_* aliases seamlessly', () => {
    const emptyEnv: NodeJS.ProcessEnv = {};
    assert.equal(isS3StorageConfigured(emptyEnv), false);

    const r2Env: NodeJS.ProcessEnv = {
      R2_ACCOUNT_ID: 'acc123',
      R2_BUCKET_NAME: 'kasirakun-media',
      R2_ACCESS_KEY_ID: 'key123',
      R2_SECRET_ACCESS_KEY: 'secret456',
      R2_PUBLIC_BASE_URL: 'https://cdn.kasirakun.id/',
    };
    const cfg = resolveS3StorageConfig(r2Env);
    assert.ok(cfg);
    assert.equal(cfg.endpoint, 'https://acc123.r2.cloudflarestorage.com');
    assert.equal(cfg.region, 'auto');
    assert.equal(cfg.bucket, 'kasirakun-media');
    assert.equal(
      buildPublicObjectUrl(cfg, 'tenant-1/products/1-abc.jpg'),
      'https://cdn.kasirakun.id/tenant-1/products/1-abc.jpg',
    );

    const biznetEnv: NodeJS.ProcessEnv = {
      S3_ENDPOINT: 'https://nos.wjv-1.neo.id',
      S3_REGION: 'idn',
      S3_BUCKET: 'umkm-assets',
      S3_ACCESS_KEY_ID: 'neo-key',
      S3_SECRET_ACCESS_KEY: 'neo-secret',
    };
    const biznetCfg = resolveS3StorageConfig(biznetEnv);
    assert.ok(biznetCfg);
    assert.equal(biznetCfg.forcePathStyle, true);
  });

  it('returns graceful unconfigured response instead of crashing when S3 env is missing', async () => {
    const res = await uploadFileToStorage(
      {
        buffer: FAKE_JPEG,
        fileName: 'kopi.jpg',
        contentType: 'image/jpeg',
        folder: 'products',
        tenantId: 'tenant-kedai-senja',
      },
      {},
    );
    assert.equal(res.ok, false);
    assert.equal(res.configured, false);
    assert.equal(res.storage, 'unconfigured');
    assert.equal(res.url, null);
  });
});
