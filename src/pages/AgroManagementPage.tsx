import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  CheckCircle2,
  PackagePlus,
  Plus,
  Scale,
  ShieldAlert,
  Sprout,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ModalShell } from '../components/ui/ModalShell';
import { useApp } from '../context/AppContext';
import { formatRupiah } from '../lib/pos/checkout-service';
import type { AgroBatch, AgroBatchUsage } from '../types/domain';

export function AgroManagementPage() {
  const {
    activeWorkspace,
    createAgroBatch,
    updateAgroMortality,
    addAgroBatchUsage,
    harvestAgroBatch,
  } = useApp();

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'HARVESTED'>('ALL');

  // Create Batch Modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [agroType, setAgroType] = useState<AgroBatch['agroType']>('TERNAK');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [initialQty, setInitialQty] = useState('1000');
  const [batchUnit, setBatchUnit] = useState('Ekor');
  const [batchNotes, setBatchNotes] = useState('');

  // Record Usage Modal
  const [usageBatch, setUsageBatch] = useState<AgroBatch | null>(null);
  const [usageCategory, setUsageCategory] = useState<AgroBatchUsage['usageCategory']>('PAKAN');
  const [usageProductId, setUsageProductId] = useState('');
  const [usageDesc, setUsageDesc] = useState('');
  const [usageQty, setUsageQty] = useState('5');
  const [usageUnit, setUsageUnit] = useState('Karung');
  const [usageUnitCost, setUsageUnitCost] = useState('420000');

  // Harvest Modal
  const [harvestBatch, setHarvestBatch] = useState<AgroBatch | null>(null);
  const [targetProductId, setTargetProductId] = useState('');
  const [netHarvestQty, setNetHarvestQty] = useState('1450');
  const [harvestUnit, setHarvestUnit] = useState('Kg');
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().slice(0, 10));

  const batches = activeWorkspace.agroBatches ?? [];
  const rawMaterialProducts = useMemo(
    () => activeWorkspace.products.filter((p) => p.productType === 'RAW_MATERIAL'),
    [activeWorkspace.products]
  );
  const finishedProducts = useMemo(
    () => activeWorkspace.products.filter((p) => p.productType !== 'RAW_MATERIAL'),
    [activeWorkspace.products]
  );

  const filteredBatches = useMemo(
    () =>
      statusFilter === 'ALL'
        ? batches
        : batches.filter((b) => b.status === statusFilter),
    [batches, statusFilter]
  );

  const kpi = useMemo(() => {
    const activeBatches = batches.filter((b) => b.status === 'ACTIVE');
    const harvestedBatches = batches.filter((b) => b.status === 'HARVESTED');
    const wipTotal = activeBatches.reduce(
      (sum, b) => sum.plus(new Decimal(b.accumulatedCost || '0')),
      new Decimal(0)
    );
    const totalInitial = batches.reduce(
      (sum, b) => sum.plus(new Decimal(b.initialQty || '0')),
      new Decimal(0)
    );
    const totalMortality = batches.reduce(
      (sum, b) => sum.plus(new Decimal(b.mortalityQty || '0')),
      new Decimal(0)
    );
    const mortalityRatePct = totalInitial.gt(0)
      ? totalMortality.div(totalInitial).times(100).toFixed(1)
      : '0.0';

    return {
      activeCount: activeBatches.length,
      harvestedCount: harvestedBatches.length,
      wipTotal: wipTotal.toFixed(4),
      mortalityRatePct,
    };
  }, [batches]);

  const previewHarvestHpp = useMemo(() => {
    if (!harvestBatch) return null;
    try {
      const qty = new Decimal(netHarvestQty || '0');
      const cost = new Decimal(harvestBatch.accumulatedCost || '0');
      if (qty.lte(0) || cost.lte(0)) return null;
      return cost.div(qty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4);
    } catch {
      return null;
    }
  }, [harvestBatch, netHarvestQty]);

  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchName.trim()) {
      setFeedback({ type: 'error', text: 'Nama siklus/blok wajib diisi.' });
      return;
    }
    try {
      createAgroBatch({
        name: batchName.trim(),
        agroType,
        startDate,
        initialQty: new Decimal(initialQty || '0').toFixed(4),
        unit: batchUnit.trim() || 'Ekor',
        notes: batchNotes.trim() || undefined,
      });
      setBatchModalOpen(false);
      setBatchName('');
      setBatchNotes('');
      setFeedback({ type: 'success', text: `Siklus ${batchName.trim()} berhasil dimulai.` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat siklus baru.',
      });
    }
  };

  const handleRecordUsage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usageBatch) return;
    try {
      addAgroBatchUsage({
        batchId: usageBatch.id,
        usageCategory,
        productId: usageProductId || null,
        description: usageDesc.trim() || `${usageCategory} ${usageBatch.name}`,
        qtyUsed: new Decimal(usageQty || '0').toFixed(4),
        unit: usageUnit.trim() || 'Kg',
        unitCost: new Decimal(usageUnitCost || '0').toFixed(4),
      });
      setUsageBatch(null);
      setUsageDesc('');
      setFeedback({
        type: 'success',
        text: 'Pemakaian bahan berhasil dicatat & dijurnal: Debit Aset Biologis/WIP (1109), Kredit Persediaan/Kas.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mencatat pemakaian bahan.',
      });
    }
  };

  const handleHarvestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!harvestBatch || !targetProductId) {
      setFeedback({ type: 'error', text: 'Pilih produk hasil panen tujuan di gudang.' });
      return;
    }
    try {
      const res = harvestAgroBatch({
        batchId: harvestBatch.id,
        targetProductId,
        netHarvestQty: new Decimal(netHarvestQty || '0').toFixed(4),
        unit: harvestUnit.trim() || 'Kg',
        harvestDate,
      });
      setHarvestBatch(null);
      setFeedback({
        type: 'success',
        text: `Panen selesai! HPP otomatis ${formatRupiah(res.unitHpp)}/${harvestUnit}. Stok hasil panen masuk gudang (Dr 1110 / Cr 1109).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mencatat panen.',
      });
    }
  };

  return (
    <AppShell
      title="Siklus Ternak, Lahan & Panen (HPP Otomatis)"
      subtitle="Akumulasi biaya bibit, pakan, pupuk & upah ke Aset Biologis/WIP (1109) hingga konversi otomatis ke Persediaan Hasil Panen (1110)"
      primaryAction={
        <button
          type="button"
          onClick={() => setBatchModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Mulai Siklus / Blok Baru</span>
        </button>
      }
    >
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Siklus / Blok Aktif</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {kpi.activeCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">Sedang berjalan &amp; mengakumulasi WIP</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Total Aset Biologis / WIP (1109)</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatRupiah(kpi.wipTotal)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Akumulasi pakan, bibit, pupuk &amp; upah</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Siklus Sudah Panen</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {kpi.harvestedCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">Stok otomatis masuk ke gudang hasil panen</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Rata-rata Mortalitas / Susut</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {kpi.mortalityRatePct}%
            </p>
            <p className="text-xs text-slate-500 mt-1">Diperhitungkan pada HPP per unit panen</p>
          </div>
        </div>

        {/* Filter */}
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'ALL', label: `Semua Siklus (${batches.length})` },
              { id: 'ACTIVE', label: 'Aktif (WIP)' },
              { id: 'HARVESTED', label: 'Selesai Panen' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                statusFilter === f.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Batch Cards */}
        {filteredBatches.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <Sprout className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">Belum ada siklus produksi</p>
            <p className="text-xs text-slate-500">
              Mulai siklus ternak (Ayam Broiler/Lele) atau blok tanam (Padi/Cabai) untuk melacak HPP panen otomatis.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBatches.map((batch) => {
              const liveQty = Decimal.max(
                new Decimal(0),
                new Decimal(batch.initialQty || '0').minus(new Decimal(batch.mortalityQty || '0'))
              );
              const lastHarvest = batch.harvests[0];
              return (
                <div
                  key={batch.id}
                  data-testid={`agro-batch-card-${batch.id}`}
                  className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">
                        {batch.agroType === 'TERNAK' ? 'Peternakan' : 'Pertanian'} · Mulai{' '}
                        <span className="font-mono">{batch.startDate}</span> ·{' '}
                        <span
                          className={`font-semibold ${
                            batch.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-700'
                          }`}
                        >
                          {batch.status === 'ACTIVE' ? 'Aktif (Akumulasi WIP)' : 'Sudah Dipanen'}
                        </span>
                      </p>
                      <h3 className="text-lg font-bold text-slate-900">{batch.name}</h3>
                      {batch.notes && <p className="text-xs text-slate-500">{batch.notes}</p>}
                    </div>

                    {batch.status === 'ACTIVE' && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setUsageBatch(batch);
                            const firstRaw = rawMaterialProducts[0];
                            if (firstRaw) {
                              setUsageProductId(firstRaw.id);
                              setUsageDesc(firstRaw.name);
                              setUsageUnit(firstRaw.unit);
                              setUsageUnitCost(
                                new Decimal(firstRaw.costPriceAvg || '0').toDecimalPlaces(0).toString()
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          <span>Catat Pakan / Pupuk / Upah</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHarvestBatch(batch);
                            setTargetProductId(finishedProducts[0]?.id ?? '');
                            setHarvestUnit(finishedProducts[0]?.unit ?? 'Kg');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                        >
                          <Scale className="w-3.5 h-3.5" />
                          <span>Catat Panen &amp; HPP</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <p className="text-xs text-slate-500">Populasi / Bibit Awal</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {new Decimal(batch.initialQty).toDecimalPlaces(0).toString()} {batch.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Mortalitas / Susut</p>
                      {batch.status === 'ACTIVE' ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <input
                            type="number"
                            min="0"
                            aria-label={`Mortalitas ${batch.name}`}
                            defaultValue={new Decimal(batch.mortalityQty).toDecimalPlaces(0).toString()}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val !== '') updateAgroMortality(batch.id, val);
                            }}
                            className="w-20 px-2 py-1 text-xs font-mono border border-slate-200 rounded-md"
                          />
                          <span className="text-xs text-slate-500">{batch.unit}</span>
                        </div>
                      ) : (
                        <p className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                          {new Decimal(batch.mortalityQty).toDecimalPlaces(0).toString()} {batch.unit}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Estimasi Hidup / Aktif</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {liveQty.toDecimalPlaces(0).toString()} {batch.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total Biaya Terakumulasi (WIP)</p>
                      <p className="text-sm font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                        {formatRupiah(batch.accumulatedCost)}
                      </p>
                    </div>
                  </div>

                  {/* Harvest Summary Banner if harvested */}
                  {lastHarvest && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-emerald-900">
                          Hasil Panen Tercatat ({lastHarvest.harvestDate}) → {lastHarvest.targetProductName}
                        </p>
                        <p className="text-emerald-800 mt-0.5 font-mono tabular-nums">
                          Panen Bersih: {new Decimal(lastHarvest.netHarvestQty).toDecimalPlaces(2).toString()}{' '}
                          {lastHarvest.unit} · Total Biaya: {formatRupiah(lastHarvest.totalBatchCost)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-emerald-700">HPP Otomatis per {lastHarvest.unit}</p>
                        <p className="text-base font-bold font-mono tabular-nums text-emerald-950">
                          {formatRupiah(lastHarvest.unitHppComputed)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Recent Usages Table */}
                  {batch.usages.length > 0 && (
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-600 mb-2">
                        Riwayat Pemakaian Pakan / Bibit / Pupuk / Upah ({batch.usages.length})
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="text-[11px] text-slate-400 border-b border-slate-100">
                              <th className="py-1.5 pr-3">Tanggal</th>
                              <th className="py-1.5 pr-3">Kategori</th>
                              <th className="py-1.5 pr-3">Keterangan</th>
                              <th className="py-1.5 pr-3 text-right">Qty</th>
                              <th className="py-1.5 text-right">Total Biaya (Dr 1109)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {batch.usages.slice(0, 6).map((u) => (
                              <tr key={u.id}>
                                <td className="py-2 pr-3 font-mono text-slate-500">{u.usageDate}</td>
                                <td className="py-2 pr-3 font-medium text-slate-700">{u.usageCategory}</td>
                                <td className="py-2 pr-3 text-slate-800">{u.description}</td>
                                <td className="py-2 pr-3 text-right font-mono tabular-nums text-slate-700">
                                  {new Decimal(u.qtyUsed).toDecimalPlaces(2).toString()} {u.unit}
                                </td>
                                <td className="py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                                  {formatRupiah(u.totalCost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Batch Modal */}
      <ModalShell
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        headerId="create-agro-batch-title"
        title="Mulai Siklus Ternak / Blok Tanam Baru"
        subtitle="Semua biaya bibit, pakan, pupuk, obat & tenaga kerja akan terakumulasi per siklus ini."
      >
        <form onSubmit={handleCreateBatch} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Siklus / Blok</label>
              <input
                type="text"
                required
                placeholder="Contoh: Ayam Broiler Batch #5 / Padi Ciherang Blok C"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Agro</label>
              <select
                value={agroType}
                onChange={(e) => setAgroType(e.target.value as AgroBatch['agroType'])}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="TERNAK">Peternakan (Ayam/Lele/Sapi/Bebek)</option>
                <option value="TANAMAN">Pertanian (Padi/Cabai/Sayur/Sawit)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Mulai</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Qty Bibit / Hewan Awal</label>
              <input
                type="number"
                min="1"
                required
                value={initialQty}
                onChange={(e) => setInitialQty(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Satuan</label>
              <input
                type="text"
                required
                placeholder="Ekor / Kg / Batang / Ha"
                value={batchUnit}
                onChange={(e) => setBatchUnit(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Kandang / Lahan</label>
            <input
              type="text"
              value={batchNotes}
              onChange={(e) => setBatchNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setBatchModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Simpan Siklus
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Record Usage Modal */}
      <ModalShell
        open={Boolean(usageBatch)}
        onClose={() => setUsageBatch(null)}
        headerId="agro-usage-modal-title"
        title={`Catat Pemakaian Bahan — ${usageBatch?.name ?? ''}`}
        subtitle="Jurnal otomatis: Debit Aset Biologis / WIP (1109), Kredit Persediaan Bahan (1105) atau Kas (1101) untuk upah."
      >
        <form onSubmit={handleRecordUsage} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori Biaya</label>
              <select
                value={usageCategory}
                onChange={(e) => setUsageCategory(e.target.value as AgroBatchUsage['usageCategory'])}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="PAKAN">Pakan Ternak</option>
                <option value="BIBIT">Bibit / DOC / Benih</option>
                <option value="PUPUK">Pupuk Pertanian</option>
                <option value="OBAT">Obat / Vitamin / Pestisida</option>
                <option value="TENAGA_KERJA">Tenaga Kerja / Upah Harian</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ambil dari Gudang (Opsional)
              </label>
              <select
                value={usageProductId}
                onChange={(e) => {
                  setUsageProductId(e.target.value);
                  const found = rawMaterialProducts.find((p) => p.id === e.target.value);
                  if (found) {
                    setUsageDesc(found.name);
                    setUsageUnit(found.unit);
                    setUsageUnitCost(
                      new Decimal(found.costPriceAvg || '0').toDecimalPlaces(0).toString()
                    );
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">-- Input Manual / Tanpa Potong Stok --</option>
                {rawMaterialProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Stok: {new Decimal(p.stockQty).toDecimalPlaces(1).toString()} {p.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Pemakaian</label>
              <input
                type="text"
                required
                placeholder="Contoh: Pakan Starter BR-1 5 Karung"
                value={usageDesc}
                onChange={(e) => setUsageDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Qty Dipakai</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={usageQty}
                onChange={(e) => setUsageQty(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Satuan</label>
              <input
                type="text"
                required
                value={usageUnit}
                onChange={(e) => setUsageUnit(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Biaya Satuan (Rp)</label>
              <input
                type="number"
                min="0"
                required
                value={usageUnitCost}
                onChange={(e) => setUsageUnitCost(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setUsageBatch(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Catat &amp; Posting Jurnal WIP
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Harvest Modal */}
      <ModalShell
        open={Boolean(harvestBatch)}
        onClose={() => setHarvestBatch(null)}
        headerId="agro-harvest-modal-title"
        title={`Catat Panen & Hitung HPP Otomatis — ${harvestBatch?.name ?? ''}`}
        subtitle="HPP/Unit = Total Biaya Batch / Qty Panen Bersih. Stok hasil panen langsung masuk gudang & dijurnal Dr 1110 / Cr 1109."
      >
        <form onSubmit={handleHarvestSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Produk Hasil Panen Tujuan (Gudang)
              </label>
              <select
                required
                value={targetProductId}
                onChange={(e) => {
                  setTargetProductId(e.target.value);
                  const found = finishedProducts.find((p) => p.id === e.target.value);
                  if (found) setHarvestUnit(found.unit);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">-- Pilih Produk Hasil Panen --</option>
                {finishedProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Satuan: {p.unit} · Harga Jual: {formatRupiah(p.sellingPrice)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Qty Panen Bersih</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={netHarvestQty}
                onChange={(e) => setNetHarvestQty(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Satuan Panen</label>
              <input
                type="text"
                required
                value={harvestUnit}
                onChange={(e) => setHarvestUnit(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Panen</label>
              <input
                type="date"
                required
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {harvestBatch && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">Total Biaya Produksi Batch</p>
                <p className="text-sm font-bold font-mono tabular-nums text-slate-900">
                  {formatRupiah(harvestBatch.accumulatedCost)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Pratinjau HPP per {harvestUnit}</p>
                <p className="text-base font-bold font-mono tabular-nums text-emerald-700">
                  {previewHarvestHpp ? formatRupiah(previewHarvestHpp) : 'Rp0'}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setHarvestBatch(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Selesaikan Panen &amp; Masukkan Stok
            </button>
          </div>
        </form>
      </ModalShell>
    </AppShell>
  );
}
