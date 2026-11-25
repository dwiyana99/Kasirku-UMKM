import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  MessageCircle,
  Send,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { useApp } from '../../context/AppContext';
import { normalizeIndonesianWaDigits } from '../../lib/messaging/whatsapp-direct';

export function getOwnerWaReminderStorageKey(tenantId: string): string {
  return `kasirakun_wa_reminder_dismissed_${tenantId}`;
}

export function isOwnerWaReminderDismissed(tenantId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(getOwnerWaReminderStorageKey(tenantId)) === '1';
  } catch {
    return false;
  }
}

export function dismissOwnerWaReminderForSession(tenantId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getOwnerWaReminderStorageKey(tenantId), '1');
  } catch {
    // Ignore storage quota errors in restricted browsing modes
  }
}

interface OwnerWaReminderModalProps {
  open: boolean;
  onClose: () => void;
  contextLabel?: string;
  onSaved?: (savedNumber: string) => void;
}

/**
 * User-friendly modal pengingat bagi pemilik usaha yang belum mengonfigurasi
 * Nomor WhatsApp Pemilik / Usaha di Pengaturan.
 * Memberikan opsi isi cepat langsung di modal atau buka halaman Pengaturan lengkap.
 */
export function OwnerWaReminderModal({
  open,
  onClose,
  contextLabel = 'ringkasan transaksi & pesanan',
  onSaved,
}: OwnerWaReminderModalProps) {
  const { activeWorkspace, updateTenantRegionalAndWa, navigate } = useApp();
  const [phoneInput, setPhoneInput] = useState(
    activeWorkspace.tenant.settings?.businessWhatsappNumber ?? ''
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setPhoneInput(activeWorkspace.tenant.settings?.businessWhatsappNumber ?? '');
      setErrorMsg(null);
      setSavedSuccess(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDismissLater = () => {
    dismissOwnerWaReminderForSession(activeWorkspace.tenant.id);
    onClose();
  };

  const handleQuickSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phoneInput.trim();
    const normalized = normalizeIndonesianWaDigits(cleaned);
    if (!normalized) {
      setErrorMsg('Masukkan minimal 8 digit nomor WhatsApp Indonesia yang aktif (contoh: 081234567890).');
      return;
    }

    updateTenantRegionalAndWa({ businessWhatsappNumber: cleaned });
    setErrorMsg(null);
    setSavedSuccess(true);
    onSaved?.(cleaned);
    window.setTimeout(() => {
      onClose();
    }, 650);
  };

  return (
    <ModalShell
      open={open}
      onClose={handleDismissLater}
      closeOnEscape={true}
      headerId="owner-wa-reminder-modal-title"
      testId="owner-wa-reminder-modal"
      maxWidthClass="max-w-lg"
      title={
        <span className="inline-flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
          <span>Aktifkan Pengiriman Nota &amp; Rekap WhatsApp</span>
        </span>
      }
      subtitle={`Tombol kirim WhatsApp di ${contextLabel} disembunyikan sementara sampai Nomor WA Pemilik diisi.`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="owner-wa-reminder-later-btn"
            onClick={handleDismissLater}
            className="px-3.5 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
          >
            Nanti Saja
          </button>
          <button
            type="button"
            data-testid="owner-wa-reminder-goto-settings-btn"
            onClick={() => {
              dismissOwnerWaReminderForSession(activeWorkspace.tenant.id);
              onClose();
              navigate('/settings/custom-fields?tab=payments_wa');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
          >
            <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Buka Pengaturan Lengkap</span>
          </button>
        </div>
      }
    >
      <div className="p-6 space-y-5">
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2.5 text-xs text-stone-700">
          <p className="font-semibold text-stone-900">
            Manfaat menambahkan Nomor WhatsApp Pemilik / Usaha:
          </p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <Send className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" strokeWidth={1.75} />
              <span>
                Kirim <strong>rincian pesanan &amp; nota</strong> ke WhatsApp pelanggan langsung
                setelah transaksi selesai tanpa biaya tambahan.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" strokeWidth={1.75} />
              <span>
                Kirim <strong>rekap tutup kasir harian</strong> (omzet, uang tunai laci, dan daftar
                stok menipis) langsung ke WhatsApp Pemilik dengan 1 klik.
              </span>
            </li>
          </ul>
        </div>

        {savedSuccess ? (
          <div
            role="status"
            data-testid="owner-wa-reminder-saved-notice"
            className="flex items-center gap-2.5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-900"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>
              Nomor WhatsApp Pemilik berhasil disimpan. Tombol kirim WhatsApp kini langsung aktif!
            </span>
          </div>
        ) : (
          <form onSubmit={handleQuickSave} className="space-y-3">
            <div>
              <label
                htmlFor="owner-wa-reminder-quick-input"
                className="block text-xs font-semibold text-stone-800 mb-1"
              >
                Isi Cepat Nomor WhatsApp Pemilik / Usaha
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="owner-wa-reminder-quick-input"
                  data-testid="owner-wa-reminder-quick-input"
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Contoh: 081234567890"
                  className="flex-1 px-3 py-2 text-sm font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
                <button
                  type="submit"
                  data-testid="owner-wa-reminder-quick-save-btn"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Simpan &amp; Aktifkan</span>
                </button>
              </div>
              {errorMsg && <p className="text-[11px] text-rose-600 mt-1.5">{errorMsg}</p>}
              <p className="text-[11px] text-stone-500 mt-1.5">
                Nomor ini bisa diubah kapan saja melalui Pengaturan Usaha &gt; Pembayaran &amp;
                WhatsApp.
              </p>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}
