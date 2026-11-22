import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, ScanBarcode } from 'lucide-react';
import type { Product } from '../types/domain';
import { formatRupiah } from '../lib/pos/checkout-service';

interface BarcodeScannerModalProps {
  products: Product[];
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({
  products,
  onDetected,
  onClose,
}: BarcodeScannerModalProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const scannerStartedRef = useRef(false);

  useEffect(() => {
    let html5QrCode: { stop: () => Promise<void>; clear: () => void } | null = null;
    let mounted = true;

    async function startCamera() {
      if (scannerStartedRef.current) return;
      scannerStartedRef.current = true;
      try {
        const mod = await import('html5-qrcode');
        if (!mounted) return;
        const scanner = new mod.Html5Qrcode('kasirakun-barcode-reader');
        html5QrCode = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 140 } },
          (decodedText) => {
            onDetected(decodedText);
          },
          () => {
            // ignore per-frame decode misses
          }
        );
      } catch {
        if (mounted) {
          setCameraError(
            'Kamera tidak tersedia pada perangkat ini. Anda tetap dapat menggunakan USB/Bluetooth Barcode Scanner (HID) atau input kode manual di bawah.'
          );
        }
      }
    }

    void startCamera();

    return () => {
      mounted = false;
      if (html5QrCode) {
        void html5QrCode.stop().catch(() => {});
      }
    };
  }, [onDetected]);

  const retailSamples = products.filter((p) => p.barcodeQr).slice(0, 4);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pemindai Barcode dan QR Kamera"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-900">Scan Barcode / QR Produk</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Pemindai"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div
            id="kasirakun-barcode-reader"
            className="w-full min-h-[180px] bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center text-xs text-slate-400"
          >
            {cameraError ? (
              <p className="p-4 text-center leading-relaxed">{cameraError}</p>
            ) : (
              <p className="p-4 text-center">Mengaktifkan kamera pemindai html5-qrcode...</p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualCode.trim()) {
                onDetected(manualCode.trim());
                setManualCode('');
              }
            }}
            className="flex gap-2"
          >
            <label htmlFor="manual-barcode-input" className="sr-only">
              Masukkan Kode Barcode
            </label>
            <input
              id="manual-barcode-input"
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Ketik atau tembak barcode USB..."
              className="flex-1 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
            >
              Tambah
            </button>
          </form>

          {retailSamples.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <p className="text-xs text-slate-500">Simulasi Cepat Barcode Produk:</p>
              <div className="grid grid-cols-1 gap-1.5">
                {retailSamples.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => onDetected(prod.barcodeQr)}
                    className="flex items-center justify-between px-3 py-2 text-left bg-slate-50 hover:bg-emerald-50 border border-slate-200 rounded-lg transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{prod.name}</p>
                      <p className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                        <ScanBarcode className="w-3 h-3" />
                        {prod.barcodeQr}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-medium text-emerald-700 shrink-0">
                      {formatRupiah(prod.sellingPrice)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
