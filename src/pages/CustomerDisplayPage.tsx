/**
 * Mode 1: Customer Facing Display (/customer-display/:branchId)
 * Designed for a secondary tablet/monitor facing the buyer at the cashier counter.
 * Polls GET /api/payments/customer-display/:branchId every 1.5 seconds.
 * Shows 3 clean states: IDLE, WAITING_PAYMENT (Dynamic QRIS / VA), and PAID (emerald animation + Web Audio chime).
 */

import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatRupiah as formatIDR } from '../lib/pos/checkout-service';
import type { CustomerDisplaySnapshot } from '../types/domain';

interface CustomerDisplayPageProps {
  branchId: string;
}

function playPaymentSuccessChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 - E5 - G5 - C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.11);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + idx * 0.11 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.11 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.11);
      osc.stop(ctx.currentTime + idx * 0.11 + 0.38);
    });
  } catch {
    // Ignore autoplay restriction errors
  }
}

export const CustomerDisplayPage: React.FC<CustomerDisplayPageProps> = ({ branchId }) => {
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const lastPaidTxnIdRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchSnapshot = async () => {
      try {
        const res = await fetch(
          `/api/payments/customer-display/${encodeURIComponent(branchId)}`
        );
        if (!res.ok) throw new Error('Gagal memuat layar pelanggan');
        const data = (await res.json()) as { snapshot: CustomerDisplaySnapshot };
        if (!alive) return;
        setSnapshot(data.snapshot);
        setError(null);

        if (
          data.snapshot.state === 'PAID' &&
          data.snapshot.transaction?.id &&
          lastPaidTxnIdRef.current !== data.snapshot.transaction.id
        ) {
          lastPaidTxnIdRef.current = data.snapshot.transaction.id;
          if (soundEnabled) {
            playPaymentSuccessChime();
          }
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Koneksi terputus');
        }
      }
    };

    void fetchSnapshot();
    const timer = window.setInterval(fetchSnapshot, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [branchId, soundEnabled]);

  useEffect(() => {
    if (snapshot?.state !== 'WAITING_PAYMENT' || !snapshot.transaction?.expiresAt) {
      setRemainingSec(0);
      return;
    }
    const updateCountdown = () => {
      const exp = new Date(snapshot.transaction!.expiresAt!).getTime();
      const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setRemainingSec(diff);
    };
    updateCountdown();
    const t = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(t);
  }, [snapshot?.state, snapshot?.transaction?.expiresAt]);

  const mins = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const secs = String(remainingSec % 60).padStart(2, '0');
  const txn = snapshot?.transaction ?? null;

  return (
    <div
      data-testid="customer-display-screen"
      className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-5 sm:p-8 select-none"
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
            <Store className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
              Layar Pelanggan • KasirAkun UMKM
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              {snapshot?.tenantName || 'KasirAkun UMKM'}{' '}
              <span className="text-slate-400 font-normal text-base">
                · {snapshot?.branchName || 'Kasir Utama'}
              </span>
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSoundEnabled((v) => !v)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 text-xs font-medium"
        >
          {soundEnabled ? (
            <>
              <Volume2 className="w-4 h-4 text-emerald-400" /> Suara Notifikasi Aktif
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4 text-slate-400" /> Suara Dimatikan
            </>
          )}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center py-6">
        {error && !snapshot ? (
          <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-8 text-center max-w-md">
            <p className="text-rose-200 font-semibold">{error}</p>
            <p className="text-xs text-rose-300/80 mt-2">
              Mencoba menyambungkan ulang ke mesin kasir secara otomatis...
            </p>
          </div>
        ) : !snapshot || snapshot.state === 'IDLE' ? (
          <div className="text-center max-w-xl space-y-5">
            <div className="w-24 h-24 rounded-3xl bg-emerald-500/15 border border-emerald-400/30 mx-auto flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-emerald-400" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Selamat Datang di {snapshot?.tenantName || 'Toko Kami'}
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Layar ini akan otomatis menampilkan kode <strong className="text-white">QRIS Dinamis</strong>{' '}
              atau <strong className="text-white">Virtual Account</strong> saat kasir memproses pembayaran non-tunai Anda.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {['QRIS', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'BCA / Mandiri / BRI / BNI'].map((b) => (
                <span
                  key={b}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        ) : snapshot.state === 'PAID' && txn ? (
          <div
            data-testid="customer-display-paid"
            className="w-full max-w-2xl bg-emerald-950/60 border-2 border-emerald-400 rounded-3xl p-8 sm:p-12 text-center space-y-5 shadow-2xl shadow-emerald-950/50"
          >
            <div className="w-24 h-24 rounded-full bg-emerald-500 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/40 animate-bounce">
              <CheckCircle2 className="w-14 h-14 text-white" />
            </div>
            <div className="space-y-2">
              <p className="text-emerald-300 font-bold tracking-widest uppercase text-sm">
                Verifikasi Otomatis Berhasil
              </p>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                PEMBAYARAN LUNAS
              </h2>
            </div>
            <div className="bg-slate-950/70 rounded-2xl p-5 max-w-md mx-auto border border-emerald-500/30 space-y-1">
              <p className="text-xs text-slate-400">Total Diterima ({txn.channelCode})</p>
              <p className="text-3xl font-extrabold text-emerald-400 font-mono">
                {formatIDR(txn.totalPayable)}
              </p>
              <p className="text-xs text-slate-400 pt-1">
                No. Transaksi: {txn.orderNumber || txn.id}
              </p>
            </div>
            <p className="text-emerald-200 text-base">
              Terima kasih telah berbelanja! Struk Anda sedang disiapkan oleh kasir.
            </p>
          </div>
        ) : txn ? (
          <div
            data-testid="customer-display-waiting"
            className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
          >
            {/* Left: Order Summary */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Rincian Tagihan
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {txn.orderNumber || txn.id}
                  </span>
                </div>

                {snapshot.itemsSummary && snapshot.itemsSummary.length > 0 ? (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {snapshot.itemsSummary.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="flex items-center justify-between text-sm border-b border-slate-800 pb-2"
                      >
                        <div>
                          <p className="font-medium text-white">{item.name}</p>
                          <p className="text-xs text-slate-400">{item.qty}x</p>
                        </div>
                        <span className="font-mono font-semibold text-slate-200">
                          {formatIDR(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    Pelanggan: <strong className="text-white">{txn.customerName || 'Pelanggan Umum'}</strong>
                  </p>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800 space-y-2">
                <div className="flex justify-between text-sm text-slate-300">
                  <span>Subtotal Belanja</span>
                  <span className="font-mono">{formatIDR(txn.baseAmount)}</span>
                </div>
                {Number(txn.customerAdminFee) > 0 && (
                  <div className="flex justify-between text-sm text-amber-300">
                    <span>Biaya Layanan Pembayaran</span>
                    <span className="font-mono">{formatIDR(txn.customerAdminFee)}</span>
                  </div>
                )}
                {txn.uniqueCode ? (
                  <div className="flex justify-between text-sm text-sky-300">
                    <span>Kode Unik Verifikasi</span>
                    <span className="font-mono">+{txn.uniqueCode}</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                  <span className="text-base font-bold text-white">TOTAL BAYAR</span>
                  <span className="text-3xl font-extrabold text-emerald-400 font-mono">
                    {formatIDR(txn.totalPayable)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Giant Dynamic QRIS or VA */}
            <div className="lg:col-span-7 bg-white text-slate-900 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-5 shadow-2xl">
              {txn.paymentCategory === 'VIRTUAL_ACCOUNT' || txn.paymentCategory === 'MANUAL_TRANSFER' ? (
                <>
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-sm">
                    <CreditCard className="w-4 h-4" />
                    {txn.paymentCategory === 'VIRTUAL_ACCOUNT'
                      ? `Virtual Account ${txn.channelCode.replace('VA_', '')}`
                      : 'Transfer Bank (Kode Unik)'}
                  </div>
                  <p className="text-slate-600 text-sm">
                    Silakan transfer tepat sesuai nominal ke nomor rekening / Virtual Account berikut:
                  </p>
                  <div className="w-full max-w-md bg-slate-100 border-2 border-slate-300 rounded-2xl p-5">
                    <p className="text-xs uppercase font-semibold text-slate-500 mb-1">
                      Nomor Tujuan
                    </p>
                    <p className="text-3xl sm:text-4xl font-extrabold font-mono tracking-wider text-slate-900 break-all">
                      {txn.vaNumber || '-'}
                    </p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
                    <p className="text-xs text-emerald-700 font-semibold">Nominal Tepat</p>
                    <p className="text-2xl font-extrabold font-mono text-emerald-800">
                      {formatIDR(txn.totalPayable)}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm">
                    <QrCode className="w-4 h-4" />
                    Scan QRIS Dinamis (Nominal Otomatis Terisi)
                  </div>
                  <div className="p-5 bg-white border-4 border-slate-900 rounded-3xl shadow-inner">
                    {txn.qrImageUrl ? (
                      <img
                        src={txn.qrImageUrl}
                        alt="QRIS Dinamis"
                        className="w-64 h-64 sm:w-72 sm:h-72 object-contain"
                      />
                    ) : (
                      <QRCodeSVG
                        value={txn.qrString || `QRIS|${txn.orderNumber}|${txn.totalPayable}`}
                        size={268}
                        level="M"
                        includeMargin={false}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Dapat Dibayar Melalui Semua Aplikasi Pembayaran:
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {['GoPay', 'OVO', 'DANA', 'ShopeePay', 'BCA Mobile', 'Livin Mandiri', 'BRImo', 'BNI Mobile'].map(
                        (wallet) => (
                          <span
                            key={wallet}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700"
                          >
                            {wallet}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <Clock className="w-3.5 h-3.5" />
                  Batas Waktu: {mins}:{secs}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Lunas Otomatis Tanpa Tunjukkan Bukti
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
        <span>Branch Display ID: {branchId}</span>
        <span>Pembayaran terverifikasi otomatis &amp; aman · KasirAkun UMKM</span>
      </footer>
    </div>
  );
};
