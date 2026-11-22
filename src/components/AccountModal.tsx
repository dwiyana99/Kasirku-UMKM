import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  LogOut,
  Store,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FEATURE_MODULES } from '../data/seedData';
import { STAFF_PERMISSIONS_META } from '../lib/rbac/staff-rbac';
import { ModalShell } from './ui/ModalShell';

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
    logoutSession,
    navigate,
  } = useApp();

  const [fullName, setFullName] = useState(session.fullName || '');
  const [phone, setPhone] = useState(activeCustomer?.phone || session.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setFullName(session.fullName || '');
      setPhone(activeCustomer?.phone || session.phone || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback('');
      setError('');
    }
  }, [open, session.fullName, session.phone, activeCustomer?.phone]);

  if (session.role === 'GUEST') return null;

  const isMaster = session.role === 'MASTER_ADMIN';
  const isStaff = session.role === 'STAFF';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setError('');

    if (!fullName.trim()) {
      setError('Nama lengkap wajib diisi.');
      return;
    }

    if (newPassword.trim()) {
      if (newPassword.trim() !== confirmPassword.trim()) {
        setError('Konfirmasi kata sandi baru tidak cocok.');
        return;
      }
    }

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

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFeedback('Profil akun berhasil diperbarui.');
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
    >
      <form onSubmit={handleSave} className="p-6 space-y-5">
        {feedback && (
          <div
            role="status"
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Peran Akses</span>
            <span className="font-semibold text-slate-900">
              {isMaster
                ? 'Master Pemilik Aplikasi (Super Admin)'
                : isStaff
                ? `Pegawai (${session.staffRoleTitle || 'Staf Operasional'})`
                : 'Pemilik Usaha UMKM (User Utama)'}
            </span>
          </div>
          {isStaff && session.staffPermissions && (
            <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200">
              <span className="text-slate-500 shrink-0">Wewenang Fitur</span>
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
                <span className="text-slate-500">Status Langganan</span>
                <span className="font-semibold text-emerald-700">
                  {activeCustomer.status} · {activeCustomer.billingCycle === 'ANNUAL' ? 'Tahunan' : 'Bulanan'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200">
                <span className="text-slate-500 shrink-0">Modul Aktif</span>
                <span className="text-right text-slate-700">
                  {activeCustomer.activeModules
                    .map((code) => FEATURE_MODULES.find((m) => m.code === code)?.name ?? code)
                    .join(', ')}
                </span>
              </div>
            </>
          )}
        </div>

        {!isStaff && (
          <div className="space-y-3">
            <div>
              <label htmlFor="acc-fullname" className="block text-xs font-medium text-slate-700 mb-1">
                Nama Lengkap
              </label>
              <input
                id="acc-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="acc-phone" className="block text-xs font-medium text-slate-700 mb-1">
                Nomor WhatsApp / Telepon
              </label>
              <input
                id="acc-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812-xxxx-xxxx"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>
        )}

        {!isMaster && !isStaff && (
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-500" />
              <span>Ubah Kata Sandi (Opsional)</span>
            </p>
            <div>
              <label htmlFor="acc-cur-pw" className="block text-xs text-slate-600 mb-1">
                Kata Sandi Saat Ini
              </label>
              <input
                id="acc-cur-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Kosongkan jika tidak ingin mengubah sandi"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="acc-new-pw" className="block text-xs text-slate-600 mb-1">
                  Kata Sandi Baru
                </label>
                <input
                  id="acc-new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="acc-confirm-pw" className="block text-xs text-slate-600 mb-1">
                  Konfirmasi Sandi Baru
                </label>
                <input
                  id="acc-confirm-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi sandi baru"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {!isMaster && !isStaff && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/settings/custom-fields');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Buka Pengaturan Profil Usaha &amp; Struk</span>
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => void handleLogout()}
            data-testid="account-modal-logout-btn"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar (Logout)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Tutup
            </button>
            {!isStaff && (
              <button
                type="submit"
                className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Simpan Profil Akun
              </button>
            )}
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
