/**
 * Universal S3 Object Storage Upload API Route (`POST /api/upload`)
 * - Enforces authentication (401) and tenant ownership / anti-BOLA (403).
 * - Validates tenantId & folder with Zod, MIME allowlist (JPG/PNG/WebP), binary magic bytes,
 *   and strict 3 MB file size cap (400).
 * - Supports both `multipart/form-data` (field `file`) and JSON base64 payload.
 * - Never exposes raw S3 SDK or internal database errors to the client.
 */

import type express from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  ALLOWED_UPLOAD_FOLDERS,
  MAX_S3_IMAGE_BYTES,
  isS3StorageConfigured,
  uploadFileToStorage,
  validateUploadFile,
} from '../lib/storage/s3-client.ts';
import { getCurrentSession } from '../lib/auth.ts';
import type { SignedSessionPayload } from '../lib/db/tenant-db.ts';

const uploadMetaSchema = z.object({
  tenantId: z
    .string()
    .trim()
    .min(1, 'ID usaha (tenantId) wajib diisi.')
    .max(100, 'ID usaha terlalu panjang.'),
  folder: z
    .enum(ALLOWED_UPLOAD_FOLDERS)
    .default('products'),
});

const jsonUploadSchema = uploadMetaSchema.extend({
  fileName: z.string().trim().min(1).max(160).optional(),
  contentType: z.string().trim().min(5).max(80),
  dataBase64: z.string().trim().min(16, 'Data gambar tidak valid.'),
});

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_S3_IMAGE_BYTES,
    files: 1,
  },
});

export interface MountUploadRoutesDeps {
  extractSessionFromRequest: (req: express.Request) => SignedSessionPayload | null;
}

export function mountUploadRoutes(
  app: express.Express,
  deps: MountUploadRoutesDeps,
): void {
  const { extractSessionFromRequest } = deps;

  app.get('/api/upload/status', (_req, res) => {
    return res.status(200).json({
      storageConfigured: isS3StorageConfigured(),
      maxFileSizeBytes: MAX_S3_IMAGE_BYTES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
  });

  app.post('/api/upload', (req, res) => {
    const contentTypeHeader = String(req.headers['content-type'] || '').toLowerCase();

    const handleParsedRequest = async (filePayload: {
      buffer: Buffer;
      fileName: string;
      contentType: string;
      tenantId: string;
      folder: string;
    }) => {
      try {
        const session = await getCurrentSession(req, extractSessionFromRequest);
        if (!session) {
          return res.status(401).json({
            error: 'Sesi masuk tidak ditemukan. Silakan masuk kembali untuk mengunggah gambar.',
          });
        }

        const metaParsed = uploadMetaSchema.safeParse({
          tenantId: filePayload.tenantId,
          folder: filePayload.folder || 'products',
        });
        if (!metaParsed.success) {
          return res.status(400).json({
            error: metaParsed.error.issues[0]?.message || 'Parameter unggahan tidak valid.',
          });
        }

        const { tenantId, folder } = metaParsed.data;

        // Anti-BOLA enforcement: ensure user owns or is assigned to tenantId (unless MASTER_ADMIN)
        const isAllowedTenant =
          session.role === 'MASTER_ADMIN' ||
          session.allowedTenantIds.includes(tenantId);

        if (!isAllowedTenant) {
          return res.status(403).json({
            error: 'Anda tidak memiliki izin mengunggah berkas ke usaha tersebut.',
          });
        }

        const validation = validateUploadFile({
          buffer: filePayload.buffer,
          contentType: filePayload.contentType,
          maxBytes: MAX_S3_IMAGE_BYTES,
        });
        if (!validation.valid) {
          return res.status(400).json({
            error: validation.error || 'Format atau ukuran file tidak valid.',
          });
        }

        const uploadResult = await uploadFileToStorage({
          buffer: filePayload.buffer,
          fileName: filePayload.fileName,
          contentType: validation.normalizedMime || filePayload.contentType,
          folder,
          tenantId,
        });

        if (!uploadResult.configured) {
          return res.status(200).json({
            ok: false,
            configured: false,
            fallbackAllowed: true,
            url: null,
            key: null,
            storage: 'unconfigured',
            message: uploadResult.message,
          });
        }

        return res.status(201).json({
          ok: true,
          configured: true,
          url: uploadResult.url,
          key: uploadResult.key,
          storage: uploadResult.storage,
          message: uploadResult.message,
        });
      } catch {
        return res.status(500).json({
          error: 'Gagal mengunggah gambar ke Object Storage. Periksa konfigurasi S3 atau coba lagi.',
        });
      }
    };

    if (contentTypeHeader.includes('multipart/form-data')) {
      memoryUpload.single('file')(req, res, (multerErr) => {
        if (multerErr) {
          if (multerErr instanceof multer.MulterError && multerErr.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              error: 'Ukuran file melebihi batas maksimal 3 MB. Kompres gambar terlebih dahulu.',
            });
          }
          return res.status(400).json({
            error: 'Berkas unggahan tidak dapat diproses. Pastikan mengirim field file gambar valid.',
          });
        }

        const uploadedFile = (req as express.Request & { file?: Express.Multer.File }).file;
        if (!uploadedFile || !uploadedFile.buffer) {
          return res.status(400).json({
            error: 'File gambar wajib dilampirkan pada field "file".',
          });
        }

        const body = (req.body || {}) as Record<string, unknown>;
        void handleParsedRequest({
          buffer: uploadedFile.buffer,
          fileName: uploadedFile.originalname || 'upload.jpg',
          contentType: uploadedFile.mimetype || 'application/octet-stream',
          tenantId: String(body.tenantId || '').trim(),
          folder: String(body.folder || 'products').trim(),
        });
      });
      return;
    }

    // JSON base64 upload fallback
    const parsedJson = jsonUploadSchema.safeParse(req.body);
    if (!parsedJson.success) {
      return res.status(400).json({
        error: parsedJson.error.issues[0]?.message || 'Payload unggahan JSON tidak valid.',
      });
    }

    const strippedBase64 = parsedJson.data.dataBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(strippedBase64, 'base64');

    void handleParsedRequest({
      buffer,
      fileName: parsedJson.data.fileName || 'upload.jpg',
      contentType: parsedJson.data.contentType,
      tenantId: parsedJson.data.tenantId,
      folder: parsedJson.data.folder,
    });
  });
}
