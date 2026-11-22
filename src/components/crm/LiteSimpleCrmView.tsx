import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  MessageCircle,
  Phone,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  buildCustomerSummaries,
  getCrmVerticalCopy,
  normalizeWhatsAppUrl,
} from '../../lib/crm/customer-history-engine';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { ModalShell } from '../ui/ModalShell';

/**
 * Clean, layperson-friendly CRM module specifically for Paket LITE (and tenants without Promo/CRM Pro).
 * Completely separated from complex discounts, wholesale tiers, loyalty points, and AR journals.
 */
export function LiteSimpleCrmView() {
  const { activeWorkspace, addCrmCustomer, navigate } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Simple Add Contact Form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const copy = useMemo(
    () => getCrmVerticalCopy(activeWorkspace.tenant.vertical),
    [activeWorkspace.tenant.vertical]
  );

  const customers = activeWorkspace.crmCustomers ?? [];
  const orders = activeWorkspace.orders ?? [];

  const summaries = useMemo(
    () => buildCustomerSummaries(customers, orders, searchQuery),
    [customers, orders, searchQuery]
  );

  const allSummaries = useMemo(
    () => buildCustomerSummaries(customers, orders, ''),
    [customers, orders]
  );

  const activeSummary = useMemo(() => {
    if (summaries.length === 0) return null;
    if (selectedCustomerId) {
      const found = summaries.find((s) => s.customer.id === selectedCustomerId);
      if (found) return found;
    }
    return summaries[0];
  }, [summaries, selectedCustomerId]);

  const activeBuyerCount = useMemo(
    () => allSummaries.filter((s) => s.orderCount > 0).length,
    [allSummaries]
  );
  const totalMemberOrders = useMemo(
    () => allSummaries.reduce((acc, s) => acc + s.orderCount, 0),
    [allSummaries]
  );

  const handleSaveNewContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setFormError(`Nama ${copy.entitySingular.toLowerCase()} wajib diisi.`);
      return;
    }
    const created = addCrmCustomer({
      name: newName.trim(),
      phoneWa: newPhone.trim(),
      totalSpend: '0.0000',
      totalSpent: '0.0000',
      loyaltyPoints: 0,
      receivableBalance: '0.0000',
      notes: newNotes.trim() || undefined,
    });
    setSelectedCustomerId(created.id);
    setNewName('');
    setNewPhone('');
    setNewNotes('');
    setFormError(null);
    setAddModalOpen(false);
    setSuccessNotice(`Kontak "${created.name}" berhasil disimpan dan siap dipilih di Kasir.`);
    window.setTimeout(() => setSuccessNotice(null), 4000);
  };

  return (
    <div className="space-y-5" data-testid="lite-simple-crm-view">
      {successNotice && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between gap-3"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>{successNotice}</span>
          </span>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-xs font-semibold underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 3-Column Clean Hairline Summary */}
      <section className="bg-white border border-stone-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
        <div className="p-5">
          <p className="text-xs text-stone-500">Total Kontak Tersimpan</p>
          <p
            data-testid="lite-crm-total-contacts"
            className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1"
          >
            {customers.length}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Bisa ditambah dari sini atau langsung di Kasir
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-stone-500">{copy.entitySingular} Pernah Bertransaksi</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {activeBuyerCount}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Otomatis terhubung dengan catatan kasir
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-stone-500">Total Riwayat Nota Member</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1">
            {totalMemberOrders}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Klik nama pelanggan untuk lihat detail belanja
          </p>
        </div>
      </section>

      {/* Search & Primary Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="search"
            data-testid="lite-crm-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Cari nama ${copy.entitySingular.toLowerCase()} atau nomor WhatsApp...`}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setAddModalOpen(true);
          }}
          data-testid="lite-crm-add-btn"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          <span>{copy.addButtonLabel}</span>
        </button>
      </div>

      {/* Master-Detail Contact List & Transaction History */}
      {customers.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-3">
          <div className="w-11 h-11 mx-auto rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
            <Users className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-stone-900">{copy.emptyTitle}</h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
              {copy.emptySubtitle}
            </p>
          </div>
          <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <UserPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{copy.addButtonLabel} Pertama</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/pos')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg"
            >
              <ShoppingBag className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Buka Kasir</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Contact Directory */}
          <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200 bg-stone-50/70 flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-800">
                Daftar Kontak ({summaries.length})
              </span>
              <span className="text-[11px] text-stone-500">Pilih untuk lihat riwayat</span>
            </div>

            {summaries.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">
                Tidak ada kontak yang cocok dengan "{searchQuery}".
              </div>
            ) : (
              <div className="divide-y divide-stone-100 max-h-[540px] overflow-y-auto">
                {summaries.map((item) => {
                  const isSelected = activeSummary?.customer.id === item.customer.id;
                  return (
                    <button
                      key={item.customer.id}
                      type="button"
                      data-testid={`lite-crm-row-${item.customer.id}`}
                      onClick={() => setSelectedCustomerId(item.customer.id)}
                      className={`w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 ${
                        isSelected
                          ? 'bg-emerald-50/70 border-l-2 border-l-emerald-600'
                          : 'hover:bg-stone-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">
                          {item.customer.name}
                        </p>
                        <p className="text-xs font-mono text-stone-500 mt-0.5 flex items-center gap-1">
                          <Phone className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                          <span>{item.customer.phoneWa || 'Belum ada no. WA'}</span>
                        </p>
                        {item.customer.notes && (
                          <p className="text-[11px] text-stone-500 mt-1 line-clamp-1">
                            {item.customer.notes}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono font-semibold tabular-nums text-stone-900">
                          {formatRupiah(item.liveTotalSpend)}
                        </p>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                          {item.orderCount} transaksi
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Selected Customer Profile + Real Transaction History */}
          <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden">
            {activeSummary ? (
              <div data-testid="lite-crm-detail-panel">
                <div className="p-5 border-b border-stone-200 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-stone-900">
                      {activeSummary.customer.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                      <span className="font-mono">
                        {activeSummary.customer.phoneWa || 'Nomor WhatsApp belum diisi'}
                      </span>
                      <span>·</span>
                      <span>{activeSummary.orderCount} transaksi tercatat</span>
                      <span>·</span>
                      <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                        Total {formatRupiah(activeSummary.liveTotalSpend)}
                      </span>
                    </div>
                    {activeSummary.customer.notes && (
                      <p className="text-xs text-stone-600 pt-1">
                        Catatan: {activeSummary.customer.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {(() => {
                      const waUrl = normalizeWhatsAppUrl(
                        activeSummary.customer.phoneWa,
                        `Halo ${activeSummary.customer.name}, terima kasih sudah berbelanja di ${activeWorkspace.tenant.name}!`
                      );
                      return waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="lite-crm-wa-btn"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
                        >
                          <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Hubungi WA</span>
                        </a>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* Transaction History List */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                      <ReceiptText className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                      <span>Riwayat Transaksi {activeSummary.customer.name}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => navigate('/pos')}
                      className="text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Buat Transaksi Baru
                    </button>
                  </div>

                  {activeSummary.matchedOrders.length === 0 ? (
                    <div className="p-6 text-center bg-stone-50 border border-stone-200 rounded-lg space-y-2">
                      <p className="text-xs font-medium text-stone-700">
                        Belum ada riwayat transaksi atas nama {activeSummary.customer.name}.
                      </p>
                      <p className="text-[11px] text-stone-500">
                        Pilih nama ini di halaman Kasir saat melayani transaksi agar riwayat belanjanya tercatat otomatis di sini.
                      </p>
                    </div>
                  ) : (
                    <div
                      data-testid="lite-crm-history-list"
                      className="divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden"
                    >
                      {activeSummary.matchedOrders.map((ord) => {
                        const dateStr = new Date(ord.createdAt).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const itemsSummary =
                          ord.items.length > 0
                            ? ord.items
                                .map(
                                  (i) =>
                                    `${i.itemNameSnapshot} (${Number(i.qty)})`
                                )
                                .join(', ')
                            : 'Transaksi umum';
                        return (
                          <div
                            key={ord.id}
                            className="px-4 py-3 flex items-start justify-between gap-3 bg-white"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-mono font-semibold text-stone-900">
                                  {ord.orderNumber}
                                </span>
                                <span className="text-[11px] text-stone-500">{dateStr}</span>
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">
                                  {ord.payment?.paymentMethod === 'CASH'
                                    ? 'Tunai'
                                    : ord.payment?.paymentMethod || 'Tunai'}
                                </span>
                              </div>
                              <p className="text-xs text-stone-600 line-clamp-2">
                                {itemsSummary}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-mono font-bold tabular-nums text-stone-900">
                                {formatRupiah(ord.grandTotal)}
                              </p>
                              <p className="text-[11px] font-medium text-emerald-700">Lunas</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-stone-500">
                Pilih kontak di sebelah kiri untuk melihat riwayat transaksi.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Simple Contact Modal */}
      <ModalShell
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        headerId="lite-crm-add-modal-header"
        testId="lite-crm-add-modal"
        maxWidthClass="max-w-md"
        title={copy.addButtonLabel}
        subtitle={`Simpan kontak ${copy.entitySingular.toLowerCase()} agar mudah dipilih saat transaksi di kasir.`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-3.5 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              form="lite-crm-add-form"
              data-testid="lite-crm-submit-btn"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Simpan Kontak
            </button>
          </div>
        }
      >
        <form id="lite-crm-add-form" onSubmit={handleSaveNewContact} className="p-6 space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {formError}
            </div>
          )}
          <div>
            <label htmlFor="lite-crm-name" className="block text-xs font-medium text-stone-700 mb-1">
              Nama {copy.entitySingular} *
            </label>
            <input
              id="lite-crm-name"
              data-testid="lite-crm-name-input"
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Contoh: Ibu Dewi / Pak Budi"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label htmlFor="lite-crm-phone" className="block text-xs font-medium text-stone-700 mb-1">
              Nomor WhatsApp / HP
            </label>
            <input
              id="lite-crm-phone"
              data-testid="lite-crm-phone-input"
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Contoh: 081234567890"
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label htmlFor="lite-crm-notes" className="block text-xs font-medium text-stone-700 mb-1">
              Catatan Singkat (Opsional)
            </label>
            <input
              id="lite-crm-notes"
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Contoh: Langganan beras & minyak setiap minggu"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
