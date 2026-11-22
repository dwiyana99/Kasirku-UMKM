import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Edit3,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { ModalShell } from '../components/ui/ModalShell';
import { useApp } from '../context/AppContext';
import {
  getAvailablePermissionsForVertical,
  STAFF_PERMISSIONS_META,
  STAFF_ROLE_PRESETS,
} from '../lib/rbac/staff-rbac';
import type {
  ActivityActionType,
  ActivityLogEntry,
  StaffAccount,
  StaffPermission,
} from '../types/domain';

const ACTION_TYPE_LABELS: Record<ActivityActionType, string> = {
  AUTH_LOGIN: 'Login Akun',
  POS_SALE: 'Transaksi Kasir POS',
  RESTOCK_PURCHASE: 'Pembelian / Restok',
  PURCHASE_ORDER: 'Purchase Order (PO)',
  STOCK_OPNAME: 'Stock Opname',
  STOCK_TRANSFER: 'Transfer Stok Antar Cabang',
  CATALOG_CHANGE: 'Perubahan Katalog',
  EXPENSE_RECORD: 'Biaya Operasional',
  ACCOUNTING_ACTION: 'Akuntansi & Jurnal',
  STAFF_MANAGE: 'Kelola Pegawai',
  SETTINGS_UPDATE: 'Pengaturan Usaha & Struk',
  SHIFT_CLOSE: 'Tutup Shift Kasir',
  KOST_BILLING: 'Tagihan & Sewa Kost',
  AGRO_HARVEST: 'Panen & Batch Agro',
};

export function StaffManagementPage() {
  const {
    activeWorkspace,
    addStaffAccount,
    updateStaffAccount,
    deleteStaffAccount,
  } = useApp();

  const staffList = activeWorkspace.staffAccounts ?? [];
  const activityLogs = activeWorkspace.activityLogs ?? [];

  const availablePermissions = useMemo(
    () => getAvailablePermissionsForVertical(activeWorkspace.tenant.vertical),
    [activeWorkspace.tenant.vertical]
  );

  const availablePermissionCodes = useMemo(
    () => new Set(availablePermissions.map((p) => p.code)),
    [availablePermissions]
  );

  const [activeTab, setActiveTab] = useState<'STAFF' | 'LOGS'>('STAFF');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Staff search
  const [staffSearch, setStaffSearch] = useState('');
  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.roleTitle.toLowerCase().includes(q)
    );
  }, [staffList, staffSearch]);

  // Log filters
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState<'ALL' | ActivityActionType>('ALL');
  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return activityLogs.filter((log) => {
      if (logActionFilter !== 'ALL' && log.actionType !== logActionFilter) return false;
      if (!q) return true;
      return (
        log.actorName.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q)
      );
    });
  }, [activityLogs, logActionFilter, logSearch]);

  // Add / Edit Staff Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffAccount | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Staff2026!');
  const [phone, setPhone] = useState('');
  const [roleTitle, setRoleTitle] = useState('Kasir');
  const [selectedPerms, setSelectedPerms] = useState<StaffPermission[]>(['POS_CASHIER']);
  const [formError, setFormError] = useState<string | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 5000);
  };

  const openAddStaffModal = () => {
    setEditingStaff(null);
    setFullName('');
    setEmail('');
    setPassword('Staff2026!');
    setPhone('');
    setRoleTitle('Kasir');
    setSelectedPerms(['POS_CASHIER']);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditStaffModal = (staff: StaffAccount) => {
    setEditingStaff(staff);
    setFullName(staff.fullName);
    setEmail(staff.email);
    setPassword(staff.password);
    setPhone(staff.phone ?? '');
    setRoleTitle(staff.roleTitle);
    setSelectedPerms([...staff.permissions]);
    setFormError(null);
    setModalOpen(true);
  };

  const togglePermission = (code: StaffPermission) => {
    setSelectedPerms((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const applyPreset = (presetId: string) => {
    const preset = STAFF_ROLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setRoleTitle(preset.roleTitle);
    setSelectedPerms(preset.permissions.filter((p) => availablePermissionCodes.has(p)));
  };

  const handleSubmitStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (selectedPerms.length === 0) {
      setFormError('Pilih minimal 1 hak akses fitur untuk pegawai ini.');
      return;
    }

    if (editingStaff) {
      updateStaffAccount(editingStaff.id, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        password: password.trim() || editingStaff.password,
        roleTitle: roleTitle.trim() || 'Pegawai',
        permissions: selectedPerms,
      });
      flashNotice(`Hak akses pegawai "${fullName.trim()}" berhasil diperbarui.`);
      setModalOpen(false);
    } else {
      const res = addStaffAccount({
        fullName,
        email,
        password,
        phone,
        roleTitle,
        permissions: selectedPerms,
      });
      if (!res.ok) {
        setFormError(res.error || 'Gagal membuat akun pegawai.');
        return;
      }
      flashNotice(
        `Akun pegawai "${res.staff?.fullName}" (${res.staff?.email}) berhasil dibuat dan siap dipakai login.`
      );
      setModalOpen(false);
    }
  };

  const staffColumns: DataTableColumn<StaffAccount>[] = [
    {
      key: 'name',
      header: 'Nama & Jabatan',
      render: (staff) => (
        <div>
          <p className="font-semibold text-slate-900">{staff.fullName}</p>
          <p className="text-[11px] text-slate-500">
            {staff.roleTitle}
            {staff.phone ? ` · ${staff.phone}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'credentials',
      header: 'Login Pegawai',
      render: (staff) => (
        <div className="font-mono text-[11px]">
          <p className="text-slate-800">{staff.email}</p>
          <p className="text-slate-500">Sandi: {staff.password}</p>
        </div>
      ),
    },
    {
      key: 'permissions',
      header: 'Wewenang Fitur',
      render: (staff) => (
        <div className="text-[11px] text-slate-700 leading-relaxed max-w-xs">
          {staff.permissions
            .map((code) => STAFF_PERMISSIONS_META.find((m) => m.code === code)?.shortLabel ?? code)
            .join(' · ')}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (staff) => (
        <span
          className={`text-xs font-semibold ${
            staff.isActive ? 'text-emerald-700' : 'text-rose-600'
          }`}
        >
          {staff.isActive ? 'Aktif' : 'Nonaktif'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (staff) => (
        <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
          <button
            type="button"
            onClick={() => openEditStaffModal(staff)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Akses</span>
          </button>
          <button
            type="button"
            onClick={() => {
              updateStaffAccount(staff.id, { isActive: !staff.isActive });
              flashNotice(
                `Akun "${staff.fullName}" ${staff.isActive ? 'dinonaktifkan' : 'diaktifkan kembali'}.`
              );
            }}
            aria-label={staff.isActive ? `Nonaktifkan ${staff.fullName}` : `Aktifkan ${staff.fullName}`}
            className={`p-1.5 rounded-lg transition-colors ${
              staff.isActive
                ? 'text-amber-700 hover:bg-amber-50'
                : 'text-emerald-700 hover:bg-emerald-50'
            }`}
            title={staff.isActive ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
          >
            {staff.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          </button>
          {confirmDeleteId === staff.id ? (
            <button
              type="button"
              onClick={() => {
                deleteStaffAccount(staff.id);
                setConfirmDeleteId(null);
                flashNotice(`Akun pegawai "${staff.fullName}" dihapus.`);
              }}
              className="px-2 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md"
            >
              Ya, Hapus
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(staff.id)}
              aria-label={`Hapus pegawai ${staff.fullName}`}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const logColumns: DataTableColumn<ActivityLogEntry>[] = [
    {
      key: 'time',
      header: 'Waktu',
      render: (log) => {
        const dt = new Date(log.createdAt);
        return (
          <span className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
            {Number.isNaN(dt.getTime())
              ? log.createdAt
              : dt.toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
          </span>
        );
      },
    },
    {
      key: 'actor',
      header: 'Pelaku (User / Pegawai)',
      render: (log) => (
        <div>
          <p className="font-semibold text-slate-900">{log.actorName}</p>
          <p className="text-[11px] text-slate-500">
            {log.actorRole === 'OWNER'
              ? 'Pemilik Utama'
              : log.actorRole === 'MASTER_ADMIN'
              ? 'Master Admin'
              : 'Pegawai'}{' '}
            · <span className="font-mono">{log.actorEmail}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Kategori Aktivitas',
      render: (log) => (
        <span className="font-semibold text-slate-800 whitespace-nowrap">
          {ACTION_TYPE_LABELS[log.actionType] ?? log.actionType}
        </span>
      ),
    },
    {
      key: 'summary',
      header: 'Ringkasan Aktivitas',
      render: (log) => <span className="text-slate-700">{log.summary}</span>,
    },
  ];

  const activeStaffCount = staffList.filter((s) => s.isActive).length;

  return (
    <AppShell
      title="Pegawai, Hak Akses & Log Aktivitas"
      subtitle={`Atur akun pegawai (Kasir, Gudang/Kulakan, SO, Operasional, Akuntansi) dan pantau seluruh aktivitas di ${activeWorkspace.tenant.name}`}
      primaryAction={
        <button
          type="button"
          onClick={openAddStaffModal}
          data-testid="open-add-staff-modal-btn"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Tambah Pegawai</span>
        </button>
      }
    >
      <div data-testid="staff-management-page" className="space-y-6">
        {notice && (
          <div
            role="status"
            className="flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Total Akun Pegawai</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {staffList.length}
            </p>
            <p className="text-[11px] text-emerald-700 mt-0.5">{activeStaffCount} aktif</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Wewenang User Utama (Pemilik)</p>
            <p className="text-base font-bold text-slate-900 mt-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Akses Penuh Semua Modul</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Bisa memantau log setiap pegawai secara real-time
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Total Log Aktivitas Tercatat</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {activityLogs.length}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Kasir, Restok, Opname, Biaya &amp; Login</p>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div
          role="tablist"
          aria-label="Tab Pegawai dan Log Aktivitas"
          className="inline-flex gap-1.5 p-1.5 bg-white border border-slate-200 rounded-xl"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'STAFF'}
            data-testid="staff-tab-accounts"
            onClick={() => setActiveTab('STAFF')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'STAFF'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Daftar Akun Pegawai ({staffList.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'LOGS'}
            data-testid="staff-tab-logs"
            onClick={() => setActiveTab('LOGS')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'LOGS'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Log Aktivitas ({activityLogs.length})</span>
          </button>
        </div>

        {activeTab === 'STAFF' ? (
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Akun Pegawai &amp; Batasan Hak Akses
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pegawai masuk lewat halaman Login biasa dengan email &amp; sandi masing-masing,
                  dan hanya melihat menu sesuai wewenang yang diberikan.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="Cari nama / email pegawai..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={openAddStaffModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>
            </div>

            <DataTable
              data={filteredStaff}
              columns={staffColumns}
              getRowKey={(s) => s.id}
              defaultPageSize={10}
              testId="staff-datatable"
              emptyState={
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">
                    Belum ada akun pegawai terdaftar untuk usaha ini.
                  </p>
                  <button
                    type="button"
                    onClick={openAddStaffModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Buat Akun Pegawai Pertama</span>
                  </button>
                </div>
              }
            />
          </section>
        ) : (
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Log Aktivitas User Utama &amp; Pegawai
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Catatan jejak audit setiap transaksi kasir, kulakan/restok, stock opname, biaya
                  operasional, dan login pegawai.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Cari nama pelaku / aktivitas..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <select
                  aria-label="Filter kategori log aktivitas"
                  value={logActionFilter}
                  onChange={(e) =>
                    setLogActionFilter(e.target.value as 'ALL' | ActivityActionType)
                  }
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  <option value="ALL">Semua Aktivitas</option>
                  {(Object.keys(ACTION_TYPE_LABELS) as ActivityActionType[]).map((key) => (
                    <option key={key} value={key}>
                      {ACTION_TYPE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DataTable
              data={filteredLogs}
              columns={logColumns}
              getRowKey={(l) => l.id}
              defaultPageSize={10}
              testId="activity-log-datatable"
              emptyState={
                <p className="text-sm text-slate-500">
                  Belum ada catatan aktivitas yang cocok dengan filter ini.
                </p>
              }
            />
          </section>
        )}
      </div>

      {/* Add / Edit Staff Account Modal (Strict ModalShell) */}
      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        headerId="staff-modal-header"
        title={
          editingStaff ? `Edit Hak Akses: ${editingStaff.fullName}` : 'Tambah Akun Pegawai Baru'
        }
        subtitle="Pilih preset jabatan atau centang fitur tertentu yang boleh diakses pegawai ini."
        testId="staff-account-modal"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSubmitStaff} className="p-6 space-y-5">
          {formError && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg"
            >
              {formError}
            </div>
          )}

          {/* 1-Click Role Presets */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-800">
              Pilih Preset Jabatan Cepat (Opsional)
            </p>
            <div className="flex flex-wrap gap-2">
              {STAFF_ROLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  data-testid={`staff-preset-${preset.id.toLowerCase()}`}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-lg transition-colors"
                >
                  {preset.roleTitle}
                </button>
              ))}
            </div>
          </div>

          {/* Identity Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="staff-fullname" className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap Pegawai *
              </label>
              <input
                id="staff-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Mis. Rina Susanti"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="staff-role-title" className="block text-xs font-semibold text-slate-700 mb-1">
                Label Jabatan *
              </label>
              <input
                id="staff-role-title"
                type="text"
                required
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Kasir / Admin Gudang / Petugas SO"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="staff-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email Login Pegawai *
              </label>
              <input
                id="staff-email"
                type="email"
                required
                disabled={Boolean(editingStaff)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kasir2@tokoku.id"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="staff-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Kata Sandi Login *
              </label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  id="staff-password"
                  type="text"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="staff-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                No. WhatsApp (Opsional)
              </label>
              <input
                id="staff-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812-xxxx-xxxx"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Granular Feature Permissions Checkboxes */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-800">
              Hak Akses Fitur yang Diizinkan ({selectedPerms.length} dipilih)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availablePermissions.map((perm) => {
                const checked = selectedPerms.includes(perm.code);
                return (
                  <label
                    key={perm.code}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                      checked
                        ? 'bg-emerald-50/70 border-emerald-300'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePermission(perm.code)}
                      data-testid={`perm-checkbox-${perm.code}`}
                      className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{perm.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {perm.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              data-testid="staff-modal-submit-btn"
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <UserPlus className="w-4 h-4" />
              <span>{editingStaff ? 'Simpan Hak Akses' : 'Buat Akun Pegawai'}</span>
            </button>
          </div>
        </form>
      </ModalShell>
    </AppShell>
  );
}
