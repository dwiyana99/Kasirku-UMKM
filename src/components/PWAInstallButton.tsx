import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          void install();
        }}
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${
          compact ? 'w-full px-3 py-2 text-xs' : 'px-3.5 py-2 text-xs'
        }`}
        aria-label="Pasang aplikasi KasirAkun ke layar utama"
      >
        <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        <span>Pasang Aplikasi (Offline POS)</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white font-semibold text-stone-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
            compact ? 'w-full px-3 py-2 text-xs' : 'px-3 py-1.5 text-xs'
          }`}
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={1.75} />
          <span>Pasang di iPhone / iPad</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
            <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-stone-900">Pasang di iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  aria-label="Tutup panduan pasang iOS"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-stone-600">
                <li>1. Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari.</li>
                <li>2. Geser ke bawah lalu pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.</li>
                <li>3. Ketuk <strong>Tambah</strong> agar kasir bisa dibuka cepat saat sinyal tidak stabil.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-stone-900 py-2 text-xs font-semibold text-white hover:bg-stone-800"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
