import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2,
  ExternalLink,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ModuleGate } from '../components/ModuleGate';
import { useApp } from '../context/AppContext';

export function TablesQrPage() {
  const { activeWorkspace, addTable, updateTable, deleteTable, navigate } = useApp();

  const [newTableNumber, setNewTableNumber] = useState('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingNumber, setEditingNumber] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const handleAddTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    const created = addTable(newTableNumber);
    flash(`Meja "${created.tableNumber}" & QR Self-Order unik berhasil dibuat.`);
    setNewTableNumber('');
  };

  const handleSaveRename = (tableId: string) => {
    if (!editingNumber.trim()) return;
    updateTable(tableId, { tableNumber: editingNumber.trim().toUpperCase() });
    setEditingTableId(null);
    flash('Nomor meja berhasil diperbarui.');
  };

  return (
    <AppShell
      title="Manajemen Meja & QR Self-Order"
      subtitle="Tambah, edit, nonaktifkan, dan cetak QR Code meja pelanggan untuk pemesanan mandiri langsung ke Dapur & Kasir"
      primaryAction={
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Semua QR Meja</span>
        </button>
      }
    >
      <ModuleGate requiredModule="QR_TABLE_KITCHEN" featureTitle="Manajemen Meja & QR Self-Order">
        <div className="space-y-6">
          {notice && (
            <div
              role="status"
              className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* Create New QR Table Bar */}
          <form
            onSubmit={handleAddTable}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-end gap-4"
          >
            <div className="flex-1">
              <label htmlFor="new-table-num" className="block text-xs font-medium text-slate-700 mb-1">
                Tambah Meja / Area QR Baru
              </label>
              <input
                id="new-table-num"
                type="text"
                required
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                placeholder="Contoh: 08, VIP-1, OUTDOOR-2, TAKEAWAY"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Meja QR</span>
            </button>
          </form>

          {/* QR Table Cards Grid */}
          {activeWorkspace.tables.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
              <QrCode className="w-10 h-10 text-slate-300 mx-auto" />
              <h2 className="text-base font-semibold text-slate-900">Belum ada meja QR terdaftar</h2>
              <p className="text-xs text-slate-500">
                Tambahkan nomor meja di atas untuk langsung menghasilkan QR Code unik per meja.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {activeWorkspace.tables.map((t) => {
                const relPath = `/order/${activeWorkspace.tenant.slug}/${t.qrToken}`;
                const fullUrl = `${originUrl}${relPath}`;
                const isEditing = editingTableId === t.id;

                return (
                  <article
                    key={t.id}
                    className={`bg-white border rounded-xl p-4 flex flex-col items-center text-center gap-3 transition-colors ${
                      t.isActive ? 'border-slate-200' : 'border-slate-200 opacity-65 bg-slate-50'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between text-xs">
                      <span
                        className={`font-semibold px-2 py-0.5 rounded ${
                          t.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {t.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTableId(t.id);
                            setEditingNumber(t.tableNumber);
                          }}
                          aria-label={`Edit Meja ${t.tableNumber}`}
                          className="p-1 text-slate-400 hover:text-slate-900 rounded"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteTable(t.id);
                            flash(`Meja "${t.tableNumber}" telah dihapus.`);
                          }}
                          aria-label={`Hapus Meja ${t.tableNumber}`}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-white p-3 border border-slate-200 rounded-xl">
                      <QRCodeSVG value={fullUrl} size={132} level="M" />
                    </div>

                    {isEditing ? (
                      <div className="w-full flex items-center gap-1">
                        <input
                          type="text"
                          value={editingNumber}
                          onChange={(e) => setEditingNumber(e.target.value)}
                          aria-label="Ubah nomor meja"
                          className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(t.id)}
                          aria-label="Simpan nama meja"
                          className="p-1 text-emerald-700 hover:bg-emerald-50 rounded"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTableId(null)}
                          aria-label="Batal ubah meja"
                          className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 w-full">
                        <h3 className="text-sm font-bold text-slate-900">Meja {t.tableNumber}</h3>
                        <p className="text-[11px] font-mono text-slate-400 truncate">{t.qrToken}</p>
                      </div>
                    )}

                    <div className="w-full flex flex-col gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => navigate(relPath)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Buka Menu QR</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTable(t.id, { isActive: !t.isActive })}
                        className="w-full py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        {t.isActive ? 'Nonaktifkan Meja' : 'Aktifkan Kembali'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </ModuleGate>
    </AppShell>
  );
}
