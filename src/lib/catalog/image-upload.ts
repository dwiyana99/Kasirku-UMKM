/**
 * Client-side product image file reader & compressor.
 * Resizes uploaded photos to max 480x480 JPEG so they persist smoothly
 * in browser storage and stay well within Firestore's 1MB document limit.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB input cap

export function processUploadedImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar (JPG, PNG, atau WebP).'));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error('Ukuran file terlalu besar. Maksimal 5 MB.'));
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
        // Fallback to raw data URL if canvas decode isn't available
        resolve(rawDataUrl);
      };
      img.onload = () => {
        try {
          const maxDim = 480;
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
          const compressed = canvas.toDataURL('image/jpeg', 0.8);
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
