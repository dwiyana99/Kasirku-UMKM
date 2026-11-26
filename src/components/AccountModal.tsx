import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  KeyRound,
  LogOut,
  Store,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FEATURE_MODULES } from '../data/seedData';
import {
  DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
  DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
  formatIdleTimeoutLabel,
  IDLE_TIMEOUT_PRESETS,
  normalizeIdleTimeoutMinutes,
} from '../lib/auth/session-timeout';
import { STAFF_PERMISSIONS_META } from '../lib/rbac/staff-rbac';
import { ModalShell } from './ui/ModalShell';

const PRESET_MINUTES_SET = new Set(IDLE_TIMEOUT_PRESETS.map((p) => p.minutes));

export function AccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    session,
    activeCustomer,
    updateOwnAccountProfile,
    updateOwnIdleTimeout,
    logoutSession,
    navigate,
  } = useApp();

  const [fullName, setFullName] = useState(session.fullName || '');
  const [phone, setPhone] = useState(activeCustomer?.phone || session.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [timeoutPreset, setTimeoutPreset] = useState<string>('0');
  const [customTimeoutMinutes, setCustomTimeoutMinutes] = useState<string>('45');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const isMaster = session.role === 'MASTER_ADMIN';
  const isStaff = session.role === 'STAFF';

  const currentEffectiveTimeout = normalizeIdleTimeoutMinutes(
    isMaster
      ? session.idleTimeoutMinutes
      : isStaff
      ? session.idleTimeoutMinutes
      : activeCustomer?.idleTimeoutMinutes ?? session.idleTimeoutMinutes,
    isMaster ? DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES : DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
  );

  useEffect(() => {
    if (open) {
      setFullName(session.fullName || '');
      setPhone(activeCustomer?.phone || session.phone || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback('');
      setError('');
      if (PRESET_MINUTES_SET.has(currentEffectiveTimeout)) {
        setTimeoutPreset(String(currentEffectiveTimeout));
        setCustomTimeoutMinutes(String(currentEffectiveTimeout || 45));
      } else {
        setTimeoutPreset('CUSTOM');
        setCustomTimeoutMinutes(String(currentEffectiveTimeout));
      }
    }
  }, [open, session.fullName, session.phone, activeCustomer?.phone, currentEffectiveTimeout]);

  if (session.role === 'GUEST') return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setError('');

    if (!fullName.trim()) {
      setError('Nama lengkap wajib diisi.');
      return;
    }

    if (newPassword.trim() && newPassword.trim() !== confirmPassword.trim()) {
      setError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    const desiredMinutes =
      timeoutPreset === 'CUSTOM'
        ? Number(customTimeoutMinutes)
        : Number(timeoutPreset);
    if (
      timeoutPreset === 'CUSTOM' &&
      (!Number.isFinite(desiredMinutes) || desiredMinutes < 5 || desiredMinutes > 1440)
    ) {
      setError('Durasi auto-logout kustom harus antara 5 hingga 1440 menit.');
      return;
    }

    setSaving(true);
    try {
      const res = updateOwnAccountProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        currentPassword: currentPassword || undefined,
        newPassword: newPassword.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.error || 'Gagal memperbarui akun.');
        return;
      }

      if (!isStaff) {
        const timeoutRes = await updateOwnIdleTimeout(
          timeoutPreset === 'CUSTOM' ? Math.round(desiredMinutes) : Number(timeoutPreset),
        );
        if (!timeoutRes.ok) {
          setError(timeoutRes.error || 'Profil tersimpan, tetapi gagal memperbarui waktu sesi.');
          return;
        }
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback('Profil akun & pengaturan batas waktu sesi berhasil disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    const dest = isMaster ? '/master/login' : '/login';
    onClose();
    await logoutSession();
    navigate(dest);
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      headerId="account-modal-title"
      title={
        isMaster
          ? 'Kelola Akun Master Admin'
          : isStaff
          ? `Akun Pegawai — ${session.staffRoleTitle || 'Staf'}`
          : 'Kelola Akun Pemilik UMKM'
      }
      subtitle={session.email}
      testId="account-modal"
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => void handleLogout()}
            data-testid="account-modal-logout-btn"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
            <span>Keluar</span>
          </button>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
            >
              Tutup
            </button>
            {!isStaff && (
              <button
                type="submit"
                form="account-modal-form"
                disabled={saving}
                data-testid="account-modal-save-btn"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            )}
          </div>
        </div>
      }
    >
      <form id="account-modal-form" onSubmit={(e) => void handleSave(e)} className="p-6 space-y-5">
        {feedback && (
          <div
            role="status"
            data-testid="account-modal-feedback"
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={1.75} />
            <span>{feedback}</span>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="px-3.5 py-2.5 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg"
          >
            {error}
          </div>
        )}

        {/* Account Summary Strip */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-stone-500">Peran Akses</span>
            <span className="font-semibold text-stone-900">
              {isMaster
                ? 'Master Pemilik Aplikasi'
                : isStaff
                ? `Pegawai (${session.staffRoleTitle || 'Staf Operasional'})`
                : session.accountScope === 'SIMULATION'
                ? 'Pemilik Usaha (Mode Simulasi)'
                : 'Pemilik Usaha UMKM'}
            </span>
          </div>
          {isStaff && session.staffPermissions && (
            <div className="flex items-start justify-between gap-2 pt-1 border-t border-stone-200">
              <span className="text-stone-500 shrink-0">Wewenang Fitur</span>
              <span className="text-right text-emerald-800 font-medium">
                {session.staffPermissions
                  .map((p) => STAFF_PERMISSIONS_META.find((m) => m.code === p)?.label ?? p)
                  .join(', ')}
              </span>
            </div>
          )}
          {!isStaff && activeCustomer && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-500">Status Langganan</span>
                <span className="font-semibold text-emerald-700">
                  {activeCustomer.status} ·{' '}
                  {activeCustomer.billingCycle === 'ANNUAL' ? 'Tahunan' : 'Bulanan'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2 pt-1 border-t border-stone-200">
                <span className="text-stone-500 shrink-0">Modul Aktif</span>
                <span className="text-right text-stone-700">
                  {activeCustomer.activeModules
                    .map((code) => FEATURE_MODULES.find((m) => m.code === code)?.name ?? code)
                    .join(', ')}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Idle Session Auto-Logout Policy */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
              <span>Batas Waktu Sesi (Auto-Logout Tidak Aktif)</span>
            </p>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-stone-700">
              {formatIdleTimeoutLabel(currentEffectiveTimeout)}
            </span>
          </div>

          {isStaff ? (
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Pengaturan keluar otomatis akun pegawai diatur oleh Pemilik Usaha di menu Pegawai &amp;
              Hak Akses atau oleh Master Admin.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                {isMaster
                  ? 'Bawaan Master Admin adalah 30 menit. Anda dapat mengubah durasi atau menonaktifkannya.'
                  : 'Bawaan akun UMKM adalah nonaktif agar kasir tidak terganggu. Aktifkan durasi keluar otomatis jika diinginkan.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  aria-label="Pilih durasi auto-logout"
                  data-testid="account-idle-timeout-select"
                  value={timeoutPreset}
                  onChange={(e) => setTimeoutPreset(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                >
                  {IDLE_TIMEOUT_PRESETS.map((preset) => (
                    <option key={preset.minutes} value={String(preset.minutes)}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="CUSTOM">Atur Kustom (Menit)...</option>
                </select>
                {timeoutPreset === 'CUSTOM' && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      data-testid="account-idle-timeout-custom"
                      value={customTimeoutMinutes}
                      onChange={(e) => setCustomTimeoutMinutes(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                    <span className="text-xs text-stone-500 shrink-0">menit</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!isStaff && (
          <div className="space-y-3">
            <div>
              <label htmlFor="acc-fullname" className="block text-xs font-medium text-stone-700 mb-1">
                Nama Lengkap
              </label>
              <input
                id="acc-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="acc-phone" className="block text-xs font-medium text-stone-700 mb-1">
                Nomor WhatsApp / Telepon
              </label>
              <input
                id="acc-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812-xxxx-xxxx"
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>
        )}

        {!isMaster && !isStaff && (
          <div className="pt-4 border-t border-stone-100 space-y-3">
            <p className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-stone-500" strokeWidth={1.75} />
              <span>Ubah Kata Sandi (Opsional)</span>
            </p>
            <div>
              <label htmlFor="acc-cur-pw" className="block text-xs text-stone-600 mb-1">
                Kata Sandi Saat Ini
              </label>
              <input
                id="acc-cur-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Kosongkan jika tidak ingin mengubah sandi"
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="acc-new-pw" className="block text-xs text-stone-600 mb-1">
                  Kata Sandi Baru
                </label>
                <input
                  id="acc-new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="acc-confirm-pw" className="block text-xs text-stone-600 mb-1">
                  Konfirmasi Sandi Baru
                </label>
                <input
                  id="acc-confirm-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi sandi baru"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {!isMaster && !isStaff && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/settings/custom-fields');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors"
            >
              <Store className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Buka Pengaturan Profil Usaha &amp; Struk</span>
            </button>
          </div>
        )}
      </form>
    </ModalShell>
  );
}
