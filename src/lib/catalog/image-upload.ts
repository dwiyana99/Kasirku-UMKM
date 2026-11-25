/**
 * Client-side product, receipt, and landing image upload helper.
 * - Validates JPG, PNG, or WebP and enforces a strict 3 MB cap matching `/api/upload`.
 * - When online & authenticated, attempts to upload directly to Universal S3 Object Storage
 *   via `POST /api/upload` (Neon Storage / Cloudflare R2 / Biznet Gio NEO).
 * - If S3 is not yet configured or the device is offline, gracefully falls back to
 *   compressed JPEG DataURL so POS, Catalog, and Landing Page workflows remain unbroken.
 */

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3 MB strict cap

export const CLIENT_ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export type ClientUploadFolder = 'products' | 'receipts' | 'landing' | 'logos' | 'proofs';

export interface S3UploadFallbackOptions {
  tenantId?: string;
  folder?: ClientUploadFolder;
  authToken?: string | null;
  maxDim?: number;
  quality?: number;
}

export function validateClientImageFile(file: File): void {
  const mime = (file.type || '').toLowerCase();
  if (!CLIENT_ALLOWED_IMAGE_TYPES.includes(mime as (typeof CLIENT_ALLOWED_IMAGE_TYPES)[number])) {
    throw new Error('Format file harus berupa gambar JPG, PNG, atau WebP.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Ukuran file terlalu besar. Maksimal 3 MB.');
  }
}

export function processUploadedImageFile(
  file: File,
  maxDim = 480,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      validateClientImageFile(file);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('File gambar tidak valid.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar dari perangkat.'));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) {
        reject(new Error('Hasil pembacaan gambar kosong.'));
        return;
      }

      const img = new Image();
      img.onerror = () => {
        resolve(rawDataUrl);
      };
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width || maxDim;
          let height = img.naturalHeight || img.height || maxDim;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * maxDim) / width));
              width = maxDim;
            } else {
              width = Math.max(1, Math.round((width * maxDim) / height));
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image to Universal S3 via `POST /api/upload` when online and configured,
 * falling back transparently to client-side compressed DataURL if S3 is unconfigured
 * or the user is working offline.
 */
export async function uploadImageWithS3Fallback(
  file: File,
  options: S3UploadFallbackOptions = {},
): Promise<{ url: string; storage: 's3' | 'local_compressed' }> {
  validateClientImageFile(file);

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const tenantId = (options.tenantId || '').trim();
  const folder: ClientUploadFolder = options.folder || 'products';

  if (isOnline && tenantId) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', tenantId);
      formData.append('folder', folder);

      const headers: Record<string, string> = {};
      if (options.authToken) {
        headers.Authorization = `Bearer ${options.authToken}`;
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          configured?: boolean;
          url?: string | null;
        };
        if (data.ok && data.configured && data.url) {
          return { url: data.url, storage: 's3' };
        }
      } else if (res.status === 400) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Format atau ukuran file tidak sesuai ketentuan.');
      }
    } catch (err) {
      // Re-throw explicit validation errors; fall back to local compression on network/unconfigured issues
      if (
        err instanceof Error &&
        (err.message.includes('Format') || err.message.includes('Ukuran file') || err.message.includes('maksimal'))
      ) {
        throw err;
      }
    }
  }

  const compressedUrl = await processUploadedImageFile(
    file,
    options.maxDim ?? 640,
    options.quality ?? 0.82,
  );
  return { url: compressedUrl, storage: 'local_compressed' };
}
