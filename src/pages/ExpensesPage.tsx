import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  CheckCircle2,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Check,
  X,
  ArrowRight,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useApp } from '../context/AppContext';
import { calculateWithholdingTax } from '../lib/tax/indonesia-tax-engine';
import { formatRupiah } from '../lib/pos/checkout-service';
import { formatDateIndo } from '../lib/date/indonesia-date';
import type { WithholdingTaxType } from '../types/domain';

export function ExpensesPage() {
  const {
    activeWorkspace,
    recordOperationalExpense,
    updateOperationalExpense,
    voidOperationalExpense,
    hasAddOn,
    navigate,
  } = useApp();

  const hasProAccountingOrTax =
    hasAddOn('ADDON_ACCOUNTING_PRO') || hasAddOn('ADDON_TAX_CORETAX');

  const expenseAccounts = useMemo(
    () => activeWorkspace.accounts.filter((a) => a.category === 'EXPENSE' && a.code.startsWith('6')),
    [activeWorkspace.accounts]
  );
  const paymentAccounts = useMemo(
    () => activeWorkspace.accounts.filter((a) => a.code === '1101' || a.code === '1102'),
    [activeWorkspace.accounts]
  );

  const [expAccountId, setExpAccountId] = useState(expenseAccounts[0]?.id ?? '');
  const [payAccountId, setPayAccountId] = useState(paymentAccounts[0]?.id ?? '');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expWhtType, setExpWhtType] = useState<WithholdingTaxType>('NONE');
  const [expCustomAttrs, setExpCustomAttrs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  // Inline Edit Description State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');

  const effectiveWhtType: WithholdingTaxType = hasProAccountingOrTax ? expWhtType : 'NONE';

  const whtPreview = useMemo(
    () => calculateWithholdingTax(expAmount || '0', effectiveWhtType),
    [expAmount, effectiveWhtType]
  );

  const expenseCustomFields = activeWorkspace.customFields.filter(
    (f) => f.targetEntity === 'expenses'
  );

  const totals = useMemo(() => {
    let gross = new Decimal(0);
    let wht = new Decimal(0);
    for (const exp of activeWorkspace.expenses) {
      gross = gross.plus(new Decimal(exp.amount || '0'));
      wht = wht.plus(new Decimal(exp.withholdingTaxAmount || '0'));
    }
    return {
      gross: gross.toFixed(4),
      wht: wht.toFixed(4),
      netCash: gross.minus(wht).toFixed(4),
    };
  }, [activeWorkspace.expenses]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 5000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDesc.trim() || !expAmount || Number(expAmount) <= 0) return;
    const chosenExp = expenseAccounts.find((a) => a.id === expAccountId) ?? expenseAccounts[0];
    const chosenPay = paymentAccounts.find((a) => a.id === payAccountId) ?? paymentAccounts[0];
    if (!chosenExp || !chosenPay) return;

    recordOperationalExpense({
      expenseAccountId: chosenExp.id,
      paymentAccountId: chosenPay.id,
      expenseDate: expDate,
      description: expDesc,
      amount: expAmount,
      withholdingTaxType: effectiveWhtType,
      customAttributes: expCustomAttrs,
    });

    flash(
      hasProAccountingOrTax
        ? `Biaya operasional "${expDesc.trim()}" berhasil dicatat dan diposting ke Jurnal Umum.`
        : `Biaya operasional "${expDesc.trim()}" berhasil dicatat dan langsung masuk ke Laporan Laba Rugi.`
    );
    setExpDesc('');
    setExpAmount('');
    setExpWhtType('NONE');
    setExpCustomAttrs({});
  };

  return (
    <AppShell
      title="Biaya Operasional & Pengeluaran"
      subtitle={
        hasProAccountingOrTax
          ? 'Catat biaya listrik, air, Wi-Fi, gaji pegawai, sewa, dan perawatan lengkap dengan potongan PPh 21/23/4(2) serta jurnal otomatis.'
          : 'Catat pengeluaran rutin usaha seperti listrik, air, Wi-Fi, gaji pegawai, dan perawatan agar Laba Rugi usaha Anda selalu akurat.'
      }
      primaryAction={
        <button
          type="button"
          onClick={() => navigate('/accounting')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
        >
          <span>Lihat Laporan Laba Rugi</span>
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      }
    >
      <div className="space-y-6" data-testid="expenses-page">
        {notice && (
          <div
            role="status"
            data-testid="expenses-notice"
            className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>{notice}</span>
          </div>
        )}

        {/* KPI Strip — Simple 2-card for LITE/BASIC/PRO, 3-card with PPh for Accounting Pro / EXPERT */}
        <section
          className={`grid grid-cols-1 gap-4 ${
            hasProAccountingOrTax ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          }`}
        >
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <p className="text-xs text-stone-500">Total Biaya Operasional</p>
            <p
              data-testid="expenses-total-gross"
              className="text-xl font-bold font-mono tabular-nums text-stone-900 mt-1"
            >
              {formatRupiah(totals.gross)}
            </p>
            <p className="text-[11px] text-stone-500 mt-1">
              Otomatis mengurangi laba bersih di Laporan Laba Rugi
            </p>
          </div>

          {hasProAccountingOrTax && (
            <div className="bg-white border border-stone-200 rounded-xl p-5">
              <p className="text-xs text-stone-500">Total Potongan PPh 21 / 23 / 4(2)</p>
              <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                {formatRupiah(totals.wht)}
              </p>
              <p className="text-[11px] text-stone-500 mt-1">
                Tercatat pada liabilitas Utang PPh (Akun 2105)
              </p>
            </div>
          )}

          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <p className="text-xs text-stone-500">
              {hasProAccountingOrTax ? 'Total Kas / Bank Keluar Bersih' : 'Total Uang Keluar (Kas/Bank)'}
            </p>
            <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatRupiah(totals.netCash)}
            </p>
            <p className="text-[11px] text-stone-500 mt-1">
              {activeWorkspace.expenses.length} catatan pengeluaran tersimpan
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Create Expense Form */}
          <form
            onSubmit={handleSubmit}
            data-testid="expenses-create-form"
            className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-stone-900">Catat Pengeluaran Baru</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                {hasProAccountingOrTax
                  ? 'Otomatis membuat Jurnal Double-Entry seimbang pada Buku Besar'
                  : 'Tersedia di semua paket untuk mencatat listrik, air, Wi-Fi, gaji, dan biaya rutin lainnya'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="opex-date" className="block text-xs font-medium text-stone-700 mb-1">
                  Tanggal
                </label>
                <input
                  id="opex-date"
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label htmlFor="opex-pay" className="block text-xs font-medium text-stone-700 mb-1">
                  Dibayar Dari
                </label>
                <select
                  id="opex-pay"
                  value={payAccountId || paymentAccounts[0]?.id || ''}
                  onChange={(e) => setPayAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                >
                  {paymentAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {hasProAccountingOrTax ? `${a.code} · ${a.name}` : a.code === '1101' ? 'Uang Tunai (Kas)' : 'Rekening Bank / Transfer'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="opex-acc" className="block text-xs font-medium text-stone-700 mb-1">
                {hasProAccountingOrTax ? 'Akun Beban (CoA)' : 'Kategori Pengeluaran'}
              </label>
              <select
                id="opex-acc"
                value={expAccountId || expenseAccounts[0]?.id || ''}
                onChange={(e) => setExpAccountId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
              >
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {hasProAccountingOrTax ? `${a.code} · ${a.name}` : a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="opex-desc" className="block text-xs font-medium text-stone-700 mb-1">
                Keterangan Pengeluaran *
              </label>
              <input
                id="opex-desc"
                data-testid="expenses-desc-input"
                type="text"
                required
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Contoh: Bayar Listrik, Air PDAM & Wi-Fi Bulan Ini"
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className={`grid grid-cols-1 gap-3 ${hasProAccountingOrTax ? 'sm:grid-cols-2' : ''}`}>
              <div>
                <label htmlFor="opex-amount" className="block text-xs font-medium text-stone-700 mb-1">
                  Nominal (Rp) *
                </label>
                <input
                  id="opex-amount"
                  data-testid="expenses-amount-input"
                  type="number"
                  min={1}
                  required
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="650000"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              {hasProAccountingOrTax && (
                <div>
                  <label htmlFor="opex-wht" className="block text-xs font-medium text-stone-700 mb-1">
                    Potongan PPh (Opsional)
                  </label>
                  <select
                    id="opex-wht"
                    value={expWhtType}
                    onChange={(e) => setExpWhtType(e.target.value as WithholdingTaxType)}
                    className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="NONE">Tanpa Potongan PPh</option>
                    <option value="PPH_21_TER">PPh 21 TER Gaji (PP 58/2023)</option>
                    <option value="PPH_23_2PCT">PPh 23 Jasa (2%)</option>
                    <option value="PPH_4_2_SEWA_10PCT">PPh 4(2) Sewa Gedung/Ruko (10%)</option>
                  </select>
                </div>
              )}
            </div>

            {hasProAccountingOrTax && effectiveWhtType !== 'NONE' && Number(expAmount) > 0 && (
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-600">Utang PPh Dipotong (Akun 2105)</span>
                  <span className="font-mono font-semibold text-amber-700 tabular-nums">
                    {formatRupiah(whtPreview.withheldAmount)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-stone-900">
                  <span>Kas/Bank Keluar Bersih</span>
                  <span className="font-mono tabular-nums">{formatRupiah(whtPreview.netCashOut)}</span>
                </div>
              </div>
            )}

            {!hasProAccountingOrTax && (
              <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-[11px] text-stone-600 leading-relaxed">
                Mode Sederhana aktif: pengeluaran langsung terhitung di Laba Rugi &amp; Arus Kas harian.
                Butuh pemotongan PPh 21/23/4(2), Buku Besar lengkap &amp; Neraca? Tersedia di Add-On Akuntansi Pro atau Paket EXPERT.
              </div>
            )}

            {expenseCustomFields.map((cf) => (
              <div key={cf.id}>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  {cf.fieldLabel}
                </label>
                <input
                  type={cf.fieldType === 'NUMBER' ? 'number' : cf.fieldType === 'DATE' ? 'date' : 'text'}
                  value={expCustomAttrs[cf.fieldKey] ?? ''}
                  onChange={(e) =>
                    setExpCustomAttrs((prev) => ({ ...prev, [cf.fieldKey]: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg"
                />
              </div>
            ))}

            <button
              type="submit"
              data-testid="expenses-submit-btn"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              <span>{hasProAccountingOrTax ? 'Simpan Biaya & Posting Jurnal' : 'Simpan Pengeluaran'}</span>
            </button>
          </form>

          {/* Expenses History Table with Edit & Reversing Void */}
          <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-stone-900">
                Daftar Biaya Operasional ({activeWorkspace.expenses.length})
              </h2>
              <span className="text-[11px] text-stone-500">
                {hasProAccountingOrTax
                  ? 'Pembatalan otomatis membuat Jurnal Pembalik'
                  : 'Pengeluaran bisa diedit atau dibatalkan kapan saja'}
              </span>
            </div>

            {activeWorkspace.expenses.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Receipt className="w-8 h-8 text-stone-300 mx-auto" strokeWidth={1.75} />
                <p className="text-sm font-medium text-stone-700">Belum ada biaya operasional tercatat.</p>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Catat biaya listrik, air, Wi-Fi, gaji pegawai, atau perlengkapan di formulir sebelah kiri agar laporan laba rugi akurat.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {activeWorkspace.expenses.map((exp) => {
                  const acc = activeWorkspace.accounts.find((a) => a.id === exp.expenseAccountId);
                  const isEditing = editingId === exp.id;
                  return (
                    <div
                      key={exp.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/70"
                    >
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              aria-label="Edit keterangan biaya"
                              className="flex-1 px-2.5 py-1 text-xs border border-stone-300 rounded-md"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editDesc.trim()) {
                                  updateOperationalExpense(exp.id, { description: editDesc.trim() });
                                  flash('Keterangan biaya operasional diperbarui.');
                                }
                                setEditingId(null);
                              }}
                              aria-label="Simpan perubahan biaya"
                              className="p-1 text-emerald-700 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-4 h-4" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              aria-label="Batal edit biaya"
                              className="p-1 text-stone-400 hover:bg-stone-100 rounded"
                            >
                              <X className="w-4 h-4" strokeWidth={1.75} />
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-stone-900">{exp.description}</p>
                        )}
                        <p className="text-xs text-stone-500 mt-0.5">
                          {formatDateIndo(exp.expenseDate)} ·{' '}
                          {hasProAccountingOrTax ? `${acc?.code ?? ''} ${acc?.name ?? ''}` : acc?.name ?? 'Biaya Operasional'}
                          {exp.withholdingTaxType !== 'NONE' && (
                            <span className="text-amber-700 font-medium">
                              {' '}· Potong PPh {formatRupiah(exp.withholdingTaxAmount)}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-mono font-bold tabular-nums text-stone-900">
                          {formatRupiah(exp.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(exp.id);
                            setEditDesc(exp.description);
                          }}
                          aria-label={`Edit biaya ${exp.description}`}
                          className="p-1.5 text-stone-400 hover:text-stone-900 rounded-lg"
                        >
                          <Pencil className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            voidOperationalExpense(exp.id, `Pembatalan: ${exp.description}`);
                            flash(
                              `Biaya "${exp.description}" berhasil dibatalkan dan saldo laporan sudah disesuaikan.`
                            );
                          }}
                          aria-label={`Batalkan biaya ${exp.description}`}
                          title="Batalkan biaya ini"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
                        >
                          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Batalkan</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
