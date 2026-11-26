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

  it('resolves Neon Object Storage AWS_* env vars with forcePathStyle and rejects placeholders', () => {
    const emptyEnv: NodeJS.ProcessEnv = {};
    assert.equal(isS3StorageConfigured(emptyEnv), false);

    // Placeholders from .env.example should be treated as unconfigured
    const placeholderEnv: NodeJS.ProcessEnv = {
      AWS_ENDPOINT_URL_S3: 'https://br-xxxx.storage.c-1.ap-southeast-1.aws.neon.tech',
      AWS_REGION: 'ap-southeast-1',
      AWS_ACCESS_KEY_ID: 'nak_live_xxxx',
      AWS_SECRET_ACCESS_KEY: 'nsk_live_xxxx',
      S3_BUCKET: 'kasirakun-assets',
    };
    assert.equal(isS3StorageConfigured(placeholderEnv), false);

    // Real Neon Object Storage env vars
    const neonEnv: NodeJS.ProcessEnv = {
      AWS_ENDPOINT_URL_S3: 'https://br-cool-darkness-1234.storage.c-1.ap-southeast-1.aws.neon.tech',
      AWS_REGION: 'ap-southeast-1',
      AWS_ACCESS_KEY_ID: 'nak_live_real123456',
      AWS_SECRET_ACCESS_KEY: 'nsk_live_realsecret789',
      S3_BUCKET: 'kasirakun-assets',
    };
    const neonCfg = resolveS3StorageConfig(neonEnv);
    assert.ok(neonCfg);
    assert.equal(
      neonCfg.endpoint,
      'https://br-cool-darkness-1234.storage.c-1.ap-southeast-1.aws.neon.tech',
    );
    assert.equal(neonCfg.region, 'ap-southeast-1');
    assert.equal(neonCfg.bucket, 'kasirakun-assets');
    assert.equal(neonCfg.forcePathStyle, true);
    assert.equal(
      buildPublicObjectUrl(neonCfg, 'tenant-1/products/1-abc.jpg'),
      'https://br-cool-darkness-1234.storage.c-1.ap-southeast-1.aws.neon.tech/kasirakun-assets/tenant-1/products/1-abc.jpg',
    );

    // Backward-compatible S3_* fallback
    const legacyS3Env: NodeJS.ProcessEnv = {
      S3_ENDPOINT: 'https://nos.wjv-1.neo.id',
      S3_REGION: 'idn',
      S3_BUCKET: 'umkm-assets',
      S3_ACCESS_KEY_ID: 'neo-key',
      S3_SECRET_ACCESS_KEY: 'neo-secret',
    };
    const legacyCfg = resolveS3StorageConfig(legacyS3Env);
    assert.ok(legacyCfg);
    assert.equal(legacyCfg.forcePathStyle, true);
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
