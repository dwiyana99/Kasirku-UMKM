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
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ModuleGate } from '../components/ModuleGate';
import { useApp } from '../context/AppContext';
import { calculateWithholdingTax } from '../lib/tax/indonesia-tax-engine';
import { formatRupiah } from '../lib/pos/checkout-service';
import type { WithholdingTaxType } from '../types/domain';

export function ExpensesPage() {
  const {
    activeWorkspace,
    recordOperationalExpense,
    updateOperationalExpense,
    voidOperationalExpense,
  } = useApp();

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

  const whtPreview = useMemo(
    () => calculateWithholdingTax(expAmount || '0', expWhtType),
    [expAmount, expWhtType]
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
      withholdingTaxType: expWhtType,
      customAttributes: expCustomAttrs,
    });

    flash(`Biaya operasional "${expDesc.trim()}" berhasil dicatat & diposting ke Jurnal Umum.`);
    setExpDesc('');
    setExpAmount('');
    setExpWhtType('NONE');
    setExpCustomAttrs({});
  };

  return (
    <AppShell
      title="Biaya Operasional & Pengeluaran"
      subtitle="Catat, ubah, dan batalkan (jurnal pembalik otomatis) biaya gaji, sewa, listrik, kemasan, lengkap dengan potongan PPh 21/23/4(2)"
    >
      <ModuleGate requiredModule="ACCOUNTING_FULL" featureTitle="Biaya Operasional & Jurnal Pengeluaran">
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

          {/* KPI Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Biaya Operasional Bruto</p>
              <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatRupiah(totals.gross)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Potongan PPh 21 / 23 / 4(2)</p>
              <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                {formatRupiah(totals.wht)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Kas / Bank Keluar Neto</p>
              <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {formatRupiah(totals.netCash)}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Create Expense Form */}
            <form
              onSubmit={handleSubmit}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">Catat Biaya Operasional Baru</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Otomatis membuat Jurnal Double-Entry seimbang pada Buku Besar
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="opex-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal
                  </label>
                  <input
                    id="opex-date"
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="opex-pay" className="block text-xs font-medium text-slate-700 mb-1">
                    Dibayar Dari
                  </label>
                  <select
                    id="opex-pay"
                    value={payAccountId || paymentAccounts[0]?.id || ''}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    {paymentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="opex-acc" className="block text-xs font-medium text-slate-700 mb-1">
                  Akun Beban (CoA)
                </label>
                <select
                  id="opex-acc"
                  value={expAccountId || expenseAccounts[0]?.id || ''}
                  onChange={(e) => setExpAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="opex-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan Pengeluaran *
                </label>
                <input
                  id="opex-desc"
                  type="text"
                  required
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="Contoh: Listrik & Air Kedai Bulan November"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="opex-amount" className="block text-xs font-medium text-slate-700 mb-1">
                    Nominal Bruto (Rp) *
                  </label>
                  <input
                    id="opex-amount"
                    type="number"
                    min={1}
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="650000"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="opex-wht" className="block text-xs font-medium text-slate-700 mb-1">
                    Potongan PPh (Opsional)
                  </label>
                  <select
                    id="opex-wht"
                    value={expWhtType}
                    onChange={(e) => setExpWhtType(e.target.value as WithholdingTaxType)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="NONE">Tanpa Potongan PPh</option>
                    <option value="PPH_21_TER">PPh 21 TER Gaji (PP 58/2023)</option>
                    <option value="PPH_23_2PCT">PPh 23 Jasa (2%)</option>
                    <option value="PPH_4_2_SEWA_10PCT">PPh 4(2) Sewa Gedung/Ruko (10%)</option>
                  </select>
                </div>
              </div>

              {expWhtType !== 'NONE' && Number(expAmount) > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Utang PPh Dipotong (Akun 2105)</span>
                    <span className="font-mono font-semibold text-amber-700 tabular-nums">
                      {formatRupiah(whtPreview.withheldAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Kas/Bank Keluar Bersih</span>
                    <span className="font-mono tabular-nums">{formatRupiah(whtPreview.netCashOut)}</span>
                  </div>
                </div>
              )}

              {expenseCustomFields.map((cf) => (
                <div key={cf.id}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {cf.fieldLabel}
                  </label>
                  <input
                    type={cf.fieldType === 'NUMBER' ? 'number' : cf.fieldType === 'DATE' ? 'date' : 'text'}
                    value={expCustomAttrs[cf.fieldKey] ?? ''}
                    onChange={(e) =>
                      setExpCustomAttrs((prev) => ({ ...prev, [cf.fieldKey]: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
              ))}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Simpan Biaya &amp; Posting Jurnal</span>
              </button>
            </form>

            {/* Expenses History Table with Edit & Reversing Void */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Biaya Operasional ({activeWorkspace.expenses.length})
                </h2>
                <span className="text-[11px] text-slate-500">
                  Pembatalan otomatis membuat Jurnal Pembalik
                </span>
              </div>

              {activeWorkspace.expenses.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm text-slate-500">Belum ada biaya operasional tercatat.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeWorkspace.expenses.map((exp) => {
                    const acc = activeWorkspace.accounts.find((a) => a.id === exp.expenseAccountId);
                    const isEditing = editingId === exp.id;
                    return (
                      <div
                        key={exp.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                      >
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                aria-label="Edit keterangan biaya"
                                className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md"
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
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                aria-label="Batal edit biaya"
                                className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-slate-900">{exp.description}</p>
                          )}
                          <p className="text-xs text-slate-500 mt-0.5">
                            {exp.expenseDate} · {acc?.code} {acc?.name}
                            {exp.withholdingTaxType !== 'NONE' && (
                              <span className="text-amber-700 font-medium">
                                {' '}· Potong PPh {formatRupiah(exp.withholdingTaxAmount)}
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-mono font-bold tabular-nums text-slate-900">
                            {formatRupiah(exp.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(exp.id);
                              setEditDesc(exp.description);
                            }}
                            aria-label={`Edit biaya ${exp.description}`}
                            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              voidOperationalExpense(exp.id, `Pembatalan: ${exp.description}`);
                              flash(
                                `Biaya "${exp.description}" dibatalkan dan Jurnal Pembalik otomatis telah diposting.`
                              );
                            }}
                            aria-label={`Batalkan biaya ${exp.description}`}
                            title="Batalkan biaya (otomatis buat Jurnal Pembalik)"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Batal/Reverse</span>
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
      </ModuleGate>
    </AppShell>
  );
}
