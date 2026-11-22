import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  CheckCircle2,
  Layers,
  MessageCircle,
  Plus,
  ShieldAlert,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LiteSimpleCrmView } from '../components/crm/LiteSimpleCrmView';
import { FeatureGuard } from '../components/FeatureGuard';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { ModalShell } from '../components/ui/ModalShell';
import { useApp } from '../context/AppContext';
import { getCrmVerticalCopy } from '../lib/crm/customer-history-engine';
import { formatRupiah } from '../lib/pos/checkout-service';
import type { CrmCustomer, PriceTier, Promotion } from '../types/domain';

type PromoTab = 'PROMOS' | 'TIERS' | 'CRM';

export function PromoCrmPage({ initialTab = 'PROMOS' }: { initialTab?: PromoTab }) {
  const {
    activeWorkspace,
    hasAddOn,
    addPromotion,
    togglePromotion,
    addPriceTier,
    deletePriceTier,
    addCrmCustomer,
    recordCrmReceivablePayment,
  } = useApp();

  const hasPromoCrmPro = hasAddOn('ADDON_PROMO_CRM');
  const liteCrmCopy = useMemo(
    () => getCrmVerticalCopy(activeWorkspace.tenant.vertical),
    [activeWorkspace.tenant.vertical]
  );

  const [activeTab, setActiveTab] = useState<PromoTab>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Promo Modal
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [promoName, setPromoName] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoType, setPromoType] = useState<Promotion['promoType']>('PERCENT');
  const [discountValue, setDiscountValue] = useState('10');
  const [minPurchase, setMinPurchase] = useState('50000');
  const [buyQty, setBuyQty] = useState('2');
  const [getQty, setGetQty] = useState('1');

  // Price Tier Modal
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [tierProductId, setTierProductId] = useState('');
  const [tierLabel, setTierLabel] = useState('Harga Grosir (>= 6)');
  const [tierMinQty, setTierMinQty] = useState('6');
  const [tierPrice, setTierPrice] = useState('16500');

  // CRM Customer Modal
  const [crmModalOpen, setCrmModalOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custReceivable, setCustReceivable] = useState('0');
  const [custNotes, setCustNotes] = useState('');

  // Receivable Payment Modal
  const [payCust, setPayCust] = useState<CrmCustomer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAccount, setPayAccount] = useState<'1101' | '1102'>('1101');

  const promos = activeWorkspace.promotions ?? [];
  const priceTiers = activeWorkspace.priceTiers ?? [];
  const crmCustomers = activeWorkspace.crmCustomers ?? [];
  const products = activeWorkspace.products;

  const totalReceivables = useMemo(
    () =>
      crmCustomers
        .reduce((acc, c) => acc.plus(new Decimal(c.receivableBalance || '0')), new Decimal(0))
        .toFixed(4),
    [crmCustomers]
  );

  const handleAddPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoName.trim() || !promoCode.trim()) return;
    addPromotion({
      name: promoName.trim(),
      code: promoCode.trim().toUpperCase(),
      promoType,
      discountValue: new Decimal(discountValue || '0').toFixed(4),
      minPurchase: new Decimal(minPurchase || '0').toFixed(4),
      buyQty: promoType === 'BUY_X_GET_Y' ? Number(buyQty || 2) : undefined,
      getQty: promoType === 'BUY_X_GET_Y' ? Number(getQty || 1) : undefined,
      isActive: true,
    });
    setPromoModalOpen(false);
    setPromoName('');
    setPromoCode('');
    setFeedback({ type: 'success', text: 'Promo baru berhasil dibuat dan siap dipakai di Kasir POS.' });
  };

  const handleAddTier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierProductId) return;
    addPriceTier({
      productId: tierProductId,
      label: tierLabel.trim() || `Grosir >= ${tierMinQty}`,
      minQty: new Decimal(tierMinQty || '1').toFixed(4),
      tierPrice: new Decimal(tierPrice || '0').toFixed(4),
    });
    setTierModalOpen(false);
    setFeedback({ type: 'success', text: 'Harga grosir bertingkat berhasil disimpan.' });
  };

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) return;
    addCrmCustomer({
      name: custName.trim(),
      phoneWa: custPhone.trim(),
      totalSpent: '0.0000',
      totalSpend: '0.0000',
      loyaltyPoints: 0,
      receivableBalance: new Decimal(custReceivable || '0').toFixed(4),
      notes: custNotes.trim() || undefined,
    });
    setCrmModalOpen(false);
    setCustName('');
    setCustPhone('');
    setCustReceivable('0');
    setCustNotes('');
    setFeedback({ type: 'success', text: 'Pelanggan baru berhasil ditambahkan ke database CRM.' });
  };

  const handlePayReceivable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payCust) return;
    try {
      recordCrmReceivablePayment(payCust.id, new Decimal(payAmount || '0').toFixed(4), payAccount);
      setPayCust(null);
      setPayAmount('');
      setFeedback({
        type: 'success',
        text: `Pelunasan piutang ${payCust.name} berhasil dijurnal (Dr Kas/Bank, Cr Piutang 1104).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mencatat pelunasan piutang.',
      });
    }
  };

  const tierColumns: DataTableColumn<PriceTier>[] = [
    {
      key: 'product',
      header: 'Produk',
      render: (t) => {
        const prod = products.find((p) => p.id === t.productId);
        return (
          <div>
            <p className="font-semibold text-slate-900">{prod?.name ?? t.productId}</p>
            <p className="text-[11px] text-slate-500">
              Harga Eceran: {prod ? formatRupiah(prod.sellingPrice) : '-'}
            </p>
          </div>
        );
      },
    },
    { key: 'label', header: 'Label Grosir', render: (t) => <span className="font-medium text-slate-800">{t.label}</span> },
    {
      key: 'minQty',
      header: 'Min Qty',
      align: 'right',
      render: (t) => (
        <span className="font-mono font-semibold tabular-nums text-slate-800">
          ≥ {new Decimal(t.minQty).toDecimalPlaces(0).toString()}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Harga Grosir / Unit',
      align: 'right',
      render: (t) => (
        <span className="font-mono font-bold tabular-nums text-emerald-700">
          {formatRupiah(t.tierPrice)}
        </span>
      ),
    },
    {
      key: 'del',
      header: 'Aksi',
      align: 'right',
      render: (t) => (
        <button
          type="button"
          onClick={() => deletePriceTier(t.id)}
          aria-label={`Hapus harga grosir ${t.label}`}
          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ),
    },
  ];

  const crmColumns: DataTableColumn<CrmCustomer>[] = [
    {
      key: 'name',
      header: 'Pelanggan',
      render: (c) => (
        <div>
          <p className="font-semibold text-slate-900">{c.name}</p>
          {c.notes && <p className="text-[11px] text-slate-500">{c.notes}</p>}
        </div>
      ),
    },
    {
      key: 'wa',
      header: 'WhatsApp',
      render: (c) => <span className="font-mono text-slate-700">{c.phoneWa || '-'}</span>,
    },
    {
      key: 'spend',
      header: 'Total Belanja',
      align: 'right',
      render: (c) => (
        <span className="font-mono tabular-nums text-slate-800">
          {formatRupiah(c.totalSpent ?? c.totalSpend ?? '0')}
        </span>
      ),
    },
    {
      key: 'points',
      header: 'Poin Loyalitas',
      align: 'right',
      render: (c) => (
        <span className="font-mono font-semibold tabular-nums text-emerald-700">
          {c.loyaltyPoints} pts
        </span>
      ),
    },
    {
      key: 'receivable',
      header: 'Saldo Piutang / Bon',
      align: 'right',
      render: (c) => {
        const bal = new Decimal(c.receivableBalance || '0');
        return (
          <span
            className={`font-mono font-semibold tabular-nums ${
              bal.gt(0) ? 'text-rose-700' : 'text-slate-500'
            }`}
          >
            {formatRupiah(c.receivableBalance || '0')}
          </span>
        );
      },
    },
    {
      key: 'action',
      header: 'Aksi',
      align: 'right',
      render: (c) => {
        const hasDebt = new Decimal(c.receivableBalance || '0').gt(0);
        const cleanPhone = (c.phoneWa || '').replace(/\D/g, '');
        const waNum = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone;
        const waText = hasDebt
          ? `Halo ${c.name}, kami dari ${activeWorkspace.tenant.name} ingin mengingatkan catatan bon/piutang sebesar ${formatRupiah(c.receivableBalance || '0')}. Terima kasih.`
          : `Halo ${c.name}, terima kasih sudah menjadi pelanggan setia ${activeWorkspace.tenant.name}!`;
        return (
          <div className="inline-flex items-center justify-end gap-1.5">
            {waNum && (
              <a
                href={`https://wa.me/${waNum}?text=${encodeURIComponent(waText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WA</span>
              </a>
            )}
            {hasDebt ? (
              <button
                type="button"
                onClick={() => {
                  setPayCust(c);
                  setPayAmount(new Decimal(c.receivableBalance || '0').toDecimalPlaces(0).toString());
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
              >
                Lunasi Bon
              </button>
            ) : (
              <span className="text-xs text-stone-400 px-1">Lunas</span>
            )}
          </div>
        );
      },
    },
  ];

  if (initialTab === 'CRM' && !hasPromoCrmPro) {
    return (
      <AppShell title={liteCrmCopy.pageTitle} subtitle={liteCrmCopy.pageSubtitle}>
        <LiteSimpleCrmView />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={
        initialTab === 'CRM'
          ? 'Manajemen CRM & Pelanggan'
          : 'Promo & Harga Grosir Bertingkat'
      }
      subtitle={
        initialTab === 'CRM'
          ? 'Database pelanggan setia, poin loyalitas, pencatatan bon/piutang, dan pengingat WhatsApp 1-klik.'
          : 'Atur diskon otomatis di Kasir POS, harga grosir per minimum qty, poin loyalitas, dan buku piutang pelanggan.'
      }
    >
      <FeatureGuard moduleCode="ADDON_PROMO_CRM">
        <div className="space-y-6">
          {feedback && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                )}
                {feedback.text}
              </span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-xs font-semibold underline"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Promo Aktif</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {promos.filter((p) => p.isActive).length} / {promos.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Aturan Harga Grosir Bertingkat</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {priceTiers.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Buku Piutang Pelanggan</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-rose-700 mt-1">
                {formatRupiah(totalReceivables)}
              </p>
            </div>
          </div>

          {/* Tabs + Primary Action */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'PROMOS', label: 'Promo & Diskon', icon: Tag },
                  { id: 'TIERS', label: 'Harga Grosir Bertingkat', icon: Layers },
                  { id: 'CRM', label: 'Pelanggan CRM & Piutang', icon: Users },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'PROMOS' && (
              <button
                type="button"
                onClick={() => setPromoModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buat Promo</span>
              </button>
            )}
            {activeTab === 'TIERS' && (
              <button
                type="button"
                onClick={() => {
                  setTierProductId(products[0]?.id ?? '');
                  setTierModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Harga Grosir</span>
              </button>
            )}
            {activeTab === 'CRM' && (
              <button
                type="button"
                onClick={() => setCrmModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Pelanggan</span>
              </button>
            )}
          </div>

          {activeTab === 'PROMOS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {promos.length === 0 ? (
                <div className="md:col-span-2 lg:col-span-3 bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  Belum ada promo. Klik Buat Promo untuk menambah diskon persen, nominal, atau Buy X Get Y.
                </div>
              ) : (
                promos.map((promo) => (
                  <div
                    key={promo.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-700">
                          {promo.code}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            promo.isActive ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {promo.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{promo.name}</h3>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {promo.promoType === 'PERCENT'
                          ? `Diskon ${new Decimal(promo.discountValue).toDecimalPlaces(0).toString()}%`
                          : promo.promoType === 'BUY_X_GET_Y'
                          ? `Beli ${promo.buyQty ?? 2} Gratis ${promo.getQty ?? 1}`
                          : `Potongan ${formatRupiah(promo.discountValue)}`}{' '}
                        · Min. Belanja {formatRupiah(promo.minPurchase)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePromotion(promo.id)}
                      className="w-full py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg"
                    >
                      {promo.isActive ? 'Nonaktifkan Promo' : 'Aktifkan Kembali'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'TIERS' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <DataTable
                data={priceTiers}
                columns={tierColumns}
                getRowKey={(t) => t.id}
                testId="price-tiers-table"
                emptyState={
                  <p className="text-sm text-slate-500">
                    Belum ada harga grosir bertingkat. Saat pembeli membeli mencapai Min Qty di Kasir POS, harga otomatis turun!
                  </p>
                }
              />
            </div>
          )}

          {activeTab === 'CRM' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <DataTable
                data={crmCustomers}
                columns={crmColumns}
                getRowKey={(c) => c.id}
                testId="crm-customers-table"
                emptyState={
                  <p className="text-sm text-slate-500">
                    Belum ada pelanggan CRM tercatat.
                  </p>
                }
              />
            </div>
          )}
        </div>
      </FeatureGuard>

      {/* Modals */}
      <ModalShell
        open={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
        headerId="add-promo-modal-title"
        title="Buat Promo / Diskon Kasir"
      >
        <form onSubmit={handleAddPromo} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Promo</label>
              <input
                type="text"
                required
                placeholder="Diskon Akhir Pekan"
                value={promoName}
                onChange={(e) => setPromoName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Promo</label>
              <input
                type="text"
                required
                placeholder="HEMAT10"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Promo</label>
              <select
                value={promoType}
                onChange={(e) => setPromoType(e.target.value as Promotion['promoType'])}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="PERCENT">Diskon Persen (%)</option>
                <option value="FIXED">Potongan Nominal (Rp)</option>
                <option value="BUY_X_GET_Y">Buy X Get Y</option>
                <option value="COMBO">Paket Combo (Potongan Rp)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {promoType === 'PERCENT' ? 'Nilai Persen (%)' : 'Nilai Potongan (Rp)'}
              </label>
              <input
                type="number"
                min="0"
                required
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            {promoType === 'BUY_X_GET_Y' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Beli (X)</label>
                  <input
                    type="number"
                    min="1"
                    value={buyQty}
                    onChange={(e) => setBuyQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gratis (Y)</label>
                  <input
                    type="number"
                    min="1"
                    value={getQty}
                    onChange={(e) => setGetQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Minimal Pembelian (Rp)</label>
              <input
                type="number"
                min="0"
                value={minPurchase}
                onChange={(e) => setMinPurchase(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setPromoModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Simpan Promo</button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={tierModalOpen}
        onClose={() => setTierModalOpen(false)}
        headerId="add-tier-modal-title"
        title="Tambah Harga Grosir Bertingkat"
      >
        <form onSubmit={handleAddTier} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Produk</label>
            <select
              required
              value={tierProductId}
              onChange={(e) => setTierProductId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Eceran: {formatRupiah(p.sellingPrice)})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Label Tier</label>
              <input type="text" required value={tierLabel} onChange={(e) => setTierLabel(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Minimal Qty</label>
              <input type="number" min="2" required value={tierMinQty} onChange={(e) => setTierMinQty(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Grosir (Rp)</label>
              <input type="number" min="1" required value={tierPrice} onChange={(e) => setTierPrice(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setTierModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Simpan Harga Grosir</button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={crmModalOpen}
        onClose={() => setCrmModalOpen(false)}
        headerId="add-crm-modal-title"
        title="Tambah Pelanggan CRM"
      >
        <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Pelanggan</label>
              <input type="text" required value={custName} onChange={(e) => setCustName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor WhatsApp</label>
              <input type="tel" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="0812..." className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Saldo Awal Piutang / Bon (Rp)</label>
              <input type="number" min="0" value={custReceivable} onChange={(e) => setCustReceivable(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan</label>
              <input type="text" value={custNotes} onChange={(e) => setCustNotes(e.target.value)} placeholder="Langganan grosir mingguan" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setCrmModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Simpan Pelanggan</button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={Boolean(payCust)}
        onClose={() => setPayCust(null)}
        headerId="pay-receivable-modal-title"
        title={`Pelunasan Piutang — ${payCust?.name ?? ''}`}
        subtitle="Jurnal otomatis: Debit Kas/Bank & Kredit Piutang Usaha (1104)."
      >
        <form onSubmit={handlePayReceivable} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal Bayar (Rp)</label>
              <input type="number" min="1" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Masuk ke Akun</label>
              <select value={payAccount} onChange={(e) => setPayAccount(e.target.value as '1101' | '1102')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                <option value="1101">Kas Tunai (1101)</option>
                <option value="1102">Bank / Transfer (1102)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setPayCust(null)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Catat Pelunasan</button>
          </div>
        </form>
      </ModalShell>
    </AppShell>
  );
}
