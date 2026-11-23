import React, { useState } from 'react';
import { CheckCircle2, FileSignature, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  CONTRACT_CATEGORY_LABELS,
  CONTRACT_PLACEHOLDER_GUIDE,
} from '../../lib/contracts/digital-contract-engine';
import type { ContractCategory, DigitalContractTemplate } from '../../types/domain';

export function ContractTemplatesPanel() {
  const {
    globalContractTemplates,
    updateGlobalContractTemplate,
    deleteGlobalContractTemplate,
  } = useApp();

  const [selectedId, setSelectedId] = useState<string>(globalContractTemplates[0]?.id ?? '');
  const selected = globalContractTemplates.find((t) => t.id === selectedId) ?? null;

  const [name, setName] = useState(selected?.name ?? '');
  const [category, setCategory] = useState<ContractCategory>(
    selected?.category ?? 'RENTAL_KENDARAAN'
  );
  const [headerTitle, setHeaderTitle] = useState(selected?.headerTitle ?? '');
  const [bodyTemplate, setBodyTemplate] = useState(selected?.bodyTemplate ?? '');
  const [footerTerms, setFooterTerms] = useState(selected?.footerTerms ?? '');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const loadTemplateIntoForm = (tpl: DigitalContractTemplate) => {
    setSelectedId(tpl.id);
    setName(tpl.name);
    setCategory(tpl.category);
    setHeaderTitle(tpl.headerTitle);
    setBodyTemplate(tpl.bodyTemplate);
    setFooterTerms(tpl.footerTerms);
    setSavedMsg(null);
  };

  const handleCreateNew = () => {
    const newId = `tpl-master-${Date.now()}`;
    setSelectedId(newId);
    setName('Template Kontrak Global Baru');
    setCategory('JASA_PROYEK');
    setHeaderTitle('SURAT PERJANJIAN KERJASAMA');
    setBodyTemplate(
      'Nomor: {{nomor_kontrak}}\nTanggal: {{tanggal_kontrak}}\n\nPihak Pertama: {{nama_usaha}}\nPihak Kedua: {{nama_pelanggan}} (WA: {{wa_pelanggan}})\n\nObjek / Layanan: {{objek_layanan}}\nPeriode: {{tanggal_mulai}} s/d {{tanggal_selesai}}\nNilai: {{nilai_kontrak}} | DP: {{nilai_deposit}}\n\nCatatan: {{catatan_khusus}}'
    );
    setFooterTerms('Berlaku sejak disetujui kedua belah pihak.');
    setSavedMsg(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !bodyTemplate.trim()) return;
    const existing = globalContractTemplates.find((t) => t.id === selectedId);
    updateGlobalContractTemplate({
      id: selectedId || `tpl-master-${Date.now()}`,
      code: existing?.code ?? `MASTER_${String(Date.now()).slice(-4)}`,
      name: name.trim(),
      category,
      scope: 'GLOBAL_MASTER',
      applicableVerticals: existing?.applicableVerticals ?? [
        'RENTAL_KENDARAAN',
        'FREELANCE',
        'KOST_KONTRAKAN',
        'HOMESTAY_VILLA',
        'SEWA_GARASI',
      ],
      headerTitle: headerTitle.trim() || name.trim().toUpperCase(),
      bodyTemplate,
      footerTerms: footerTerms.trim(),
      updatedAt: new Date().toISOString(),
    });
    setSavedMsg(`Template global "${name.trim()}" disimpan dan langsung tersedia untuk seluruh UMKM terkait.`);
  };

  return (
    <div className="space-y-4" data-testid="master-contract-templates-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-emerald-700" strokeWidth={1.75} />
            <span>Master Template Kontrak Digital (Rental &amp; Jasa)</span>
          </h2>
          <p className="text-xs text-stone-500">
            Atur template bawaan yang otomatis muncul di menu Kontrak Digital milik seluruh pelanggan UMKM rental, properti, dan jasa.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>Tambah Template Global</span>
        </button>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" strokeWidth={1.75} />
          <span>{savedMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-4 rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden">
          {globalContractTemplates.map((tpl) => {
            const isSel = tpl.id === selectedId;
            return (
              <div
                key={tpl.id}
                className={`p-3.5 flex items-start justify-between gap-2 ${
                  isSel ? 'bg-emerald-50/70' : 'hover:bg-stone-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => loadTemplateIntoForm(tpl)}
                  className="text-left min-w-0 flex-1"
                >
                  <p className="text-xs font-bold text-stone-900 truncate">{tpl.name}</p>
                  <p className="text-[11px] text-stone-500">
                    {CONTRACT_CATEGORY_LABELS[tpl.category]}
                  </p>
                </button>
                {globalContractTemplates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteGlobalContractTemplate(tpl.id)}
                    aria-label={`Hapus ${tpl.name}`}
                    className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <form
          onSubmit={handleSubmit}
          className="lg:col-span-8 rounded-xl border border-stone-200 bg-white p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Nama Template
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Kategori
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ContractCategory)}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
              >
                {(Object.keys(CONTRACT_CATEGORY_LABELS) as ContractCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {CONTRACT_CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Judul Header PDF / Cetak
            </label>
            <input
              type="text"
              value={headerTitle}
              onChange={(e) => setHeaderTitle(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Isi Template Kontrak
            </label>
            <textarea
              rows={9}
              required
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CONTRACT_PLACEHOLDER_GUIDE.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => setBodyTemplate((prev) => `${prev} ${p.token}`)}
                  className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-[10px] text-stone-700 hover:border-emerald-400"
                >
                  {p.token}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Ketentuan Penutup
            </label>
            <input
              type="text"
              value={footerTerms}
              onChange={(e) => setFooterTerms(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Simpan &amp; Sinkron ke Semua UMKM
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
