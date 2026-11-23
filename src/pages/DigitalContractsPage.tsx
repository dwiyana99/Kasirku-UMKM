import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  FileSignature,
  MessageCircle,
  Plus,
  Printer,
  Save,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useApp } from '../context/AppContext';
import {
  buildContractWaDeliveryUrl,
  buildDigitalContractPrintHtml,
  CONTRACT_CATEGORY_LABELS,
  CONTRACT_PLACEHOLDER_GUIDE,
  downloadDigitalContractPdf,
  getDefaultContractCategoryForVertical,
  renderContractTemplate,
  verticalSupportsDigitalContracts,
} from '../lib/contracts/digital-contract-engine';
import { formatRupiah } from '../lib/pos/checkout-service';
import type { ContractCategory, DigitalContractTemplate } from '../types/domain';

export function DigitalContractsPage() {
  const {
    activeWorkspace,
    globalContractTemplates,
    saveTenantContractTemplate,
    deleteTenantContractTemplate,
    createDigitalContract,
    updateDigitalContractStatus,
    navigate,
  } = useApp();

  const tenant = activeWorkspace.tenant;
  const isSupported = verticalSupportsDigitalContracts(tenant.vertical, tenant.subscriptionPlan);
  const defaultCategory = getDefaultContractCategoryForVertical(tenant.vertical);

  const customTemplates = activeWorkspace.contractTemplates ?? [];
  const allTemplates = useMemo(
    () => [...customTemplates, ...globalContractTemplates],
    [customTemplates, globalContractTemplates]
  );

  const recommendedTemplates = useMemo(() => {
    const matched = allTemplates.filter(
      (t) =>
        t.applicableVerticals.includes(tenant.vertical) ||
        t.category === defaultCategory ||
        t.scope === 'TENANT_CUSTOM'
    );
    return matched.length > 0 ? matched : allTemplates;
  }, [allTemplates, defaultCategory, tenant.vertical]);

  const [activeTab, setActiveTab] = useState<'CREATE' | 'TEMPLATES' | 'ARCHIVE'>('CREATE');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    recommendedTemplates[0]?.id ?? allTemplates[0]?.id ?? ''
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const [contractNumber, setContractNumber] = useState(
    `KTR-${todayStr.replace(/-/g, '')}-${String(Date.now()).slice(-3)}`
  );
  const [customerName, setCustomerName] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [objectSummary, setObjectSummary] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [contractValue, setContractValue] = useState('500000');
  const [depositValue, setDepositValue] = useState('150000');
  const [catatanKhusus, setCatatanKhusus] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // Template customization editor state
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<ContractCategory>(defaultCategory);
  const [tplHeader, setTplHeader] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplFooter, setTplFooter] = useState('');

  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const activeTemplate = useMemo(
    () =>
      allTemplates.find((t) => t.id === selectedTemplateId) ??
      recommendedTemplates[0] ??
      allTemplates[0],
    [allTemplates, recommendedTemplates, selectedTemplateId]
  );

  const renderedText = useMemo(() => {
    if (!activeTemplate) return '';
    return renderContractTemplate(activeTemplate, {
      nomorKontrak: contractNumber,
      tanggalKontrak: todayStr,
      namaUsaha: tenant.name,
      alamatUsaha: tenant.address,
      waUsaha: tenant.settings.businessWhatsappNumber || '-',
      namaPelanggan: customerName || '[Nama Pelanggan]',
      nikPelanggan: customerIdNumber || '-',
      waPelanggan: customerPhone || '-',
      objekLayanan: objectSummary || '[Rincian Unit / Jasa]',
      tanggalMulai: startDate,
      tanggalSelesai: endDate,
      nilaiKontrak: contractValue,
      nilaiDeposit: depositValue,
      catatanKhusus,
    });
  }, [
    activeTemplate,
    catatanKhusus,
    contractNumber,
    contractValue,
    customerIdNumber,
    customerName,
    customerPhone,
    depositValue,
    endDate,
    objectSummary,
    startDate,
    tenant.address,
    tenant.name,
    tenant.settings.businessWhatsappNumber,
    todayStr,
  ]);

  const waDelivery = useMemo(() => {
    if (!customerPhone.trim()) {
      return { ok: false, url: null, error: 'Isi Nomor WhatsApp pelanggan terlebih dahulu.' };
    }
    return buildContractWaDeliveryUrl({
      businessWhatsappNumber: tenant.settings.businessWhatsappNumber,
      customerPhone,
      businessName: tenant.name,
      contractNumber,
      customerName: customerName || 'Pelanggan',
      renderedText,
    });
  }, [
    contractNumber,
    customerName,
    customerPhone,
    renderedText,
    tenant.name,
    tenant.settings.businessWhatsappNumber,
  ]);

  const handleSaveContractRecord = (status: 'DRAFT' | 'SENT_WA' = 'DRAFT') => {
    if (!activeTemplate) return;
    if (!customerName.trim() || !objectSummary.trim()) {
      setNotice('Lengkapi Nama Pelanggan dan Rincian Unit / Lingkup Jasa terlebih dahulu.');
      return;
    }
    createDigitalContract({
      contractNumber,
      templateId: activeTemplate.id,
      templateName: activeTemplate.name,
      category: activeTemplate.category,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerIdNumber: customerIdNumber.trim() || undefined,
      objectSummary: objectSummary.trim(),
      contractValue: String(Number(contractValue || 0)),
      depositValue: String(Number(depositValue || 0)),
      startDate,
      endDate,
      renderedText,
      status,
    });
    setNotice(`Kontrak ${contractNumber} tersimpan ke arsip usaha Anda.`);
    setContractNumber(`KTR-${todayStr.replace(/-/g, '')}-${String(Date.now()).slice(-3)}`);
  };

  const handleDownloadPdf = () => {
    if (!activeTemplate) return;
    downloadDigitalContractPdf({
      contractNumber,
      headerTitle: activeTemplate.headerTitle,
      businessName: tenant.name,
      customerName: customerName || 'Pelanggan',
      renderedText,
    });
    setNotice(`File PDF Kontrak_${contractNumber}.pdf berhasil diunduh.`);
  };

  const handlePrintContract = () => {
    if (!activeTemplate || !printFrameRef.current) return;
    const html = buildDigitalContractPrintHtml({
      contractNumber,
      headerTitle: activeTemplate.headerTitle,
      businessName: tenant.name,
      customerName: customerName || 'Pelanggan',
      renderedText,
    });
    const doc = printFrameRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    window.setTimeout(() => {
      printFrameRef.current?.contentWindow?.print();
    }, 120);
  };

  const startCustomizeTemplate = (tpl?: DigitalContractTemplate) => {
    if (tpl) {
      setEditingTplId(tpl.scope === 'TENANT_CUSTOM' ? tpl.id : `custom-${Date.now()}`);
      setTplName(tpl.scope === 'TENANT_CUSTOM' ? tpl.name : `${tpl.name} (Custom)`);
      setTplCategory(tpl.category);
      setTplHeader(tpl.headerTitle);
      setTplBody(tpl.bodyTemplate);
      setTplFooter(tpl.footerTerms);
    } else {
      setEditingTplId(`custom-${Date.now()}`);
      setTplName('Template Kontrak Custom');
      setTplCategory(defaultCategory);
      setTplHeader('SURAT PERJANJIAN LAYANAN');
      setTplBody(
        'Nomor: {{nomor_kontrak}}\nTanggal: {{tanggal_kontrak}}\n\nPihak Pertama: {{nama_usaha}}\nPihak Kedua: {{nama_pelanggan}} (WA: {{wa_pelanggan}})\n\nObjek / Layanan: {{objek_layanan}}\nPeriode: {{tanggal_mulai}} s/d {{tanggal_selesai}}\nNilai: {{nilai_kontrak}} | DP: {{nilai_deposit}}\n\nCatatan: {{catatan_khusus}}'
      );
      setTplFooter('Disetujui oleh kedua belah pihak.');
    }
    setActiveTab('TEMPLATES');
  };

  const handleSaveCustomTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim() || !tplBody.trim()) return;
    const savedId = editingTplId || `custom-${Date.now()}`;
    saveTenantContractTemplate({
      id: savedId,
      code: `CUSTOM_${String(Date.now()).slice(-4)}`,
      name: tplName.trim(),
      category: tplCategory,
      scope: 'TENANT_CUSTOM',
      applicableVerticals: [tenant.vertical],
      headerTitle: tplHeader.trim() || tplName.trim().toUpperCase(),
      bodyTemplate: tplBody,
      footerTerms: tplFooter.trim(),
      updatedAt: new Date().toISOString(),
    });
    setSelectedTemplateId(savedId);
    setEditingTplId(null);
    setNotice(`Template custom "${tplName.trim()}" berhasil disimpan dan siap dipakai.`);
  };

  const savedContracts = activeWorkspace.digitalContracts ?? [];

  if (!isSupported) {
    return (
      <AppShell
        title="Generator Kontrak Digital"
        subtitle="Fitur ini aktif khusus untuk usaha rental, properti, jasa proyek, dan layanan berbasis perjanjian."
      >
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center space-y-3">
          <FileSignature className="w-8 h-8 mx-auto text-stone-400" strokeWidth={1.75} />
          <h2 className="text-base font-bold text-stone-900">Tidak Diperlukan untuk Jenis Usaha Ini</h2>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Usaha penjualan harian di kasir cukup memakai struk transaksi biasa tanpa kontrak perjanjian tertulis.
          </p>
          <button
            type="button"
            onClick={() => navigate('/pos')}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Kembali ke Kasir
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Generator Kontrak Digital"
      subtitle="Buat kontrak rental atau jasa dari template siap pakai atau custom, unduh PDF, cetak, dan kirim langsung via WhatsApp."
    >
      <div className="space-y-5" data-testid="digital-contracts-page">
        <iframe
          ref={printFrameRef}
          title="Pratinjau Cetak Kontrak"
          className="hidden"
        />

        {notice && (
          <div
            data-testid="contract-notice"
            className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" strokeWidth={1.75} />
              {notice}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="font-semibold text-emerald-700 hover:underline"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Mode Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('CREATE')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'CREATE'
                ? 'bg-stone-900 text-white'
                : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
            }`}
          >
            Buat Kontrak Baru
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TEMPLATES')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'TEMPLATES'
                ? 'bg-stone-900 text-white'
                : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
            }`}
          >
            Kustomisasi Template ({allTemplates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ARCHIVE')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'ARCHIVE'
                ? 'bg-stone-900 text-white'
                : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
            }`}
          >
            Arsip Kontrak ({savedContracts.length})
          </button>
        </div>

        {activeTab === 'CREATE' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Form */}
            <div className="lg:col-span-6 rounded-xl border border-stone-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-stone-900">Data Perjanjian</h2>
                {activeTemplate && (
                  <button
                    type="button"
                    onClick={() => startCustomizeTemplate(activeTemplate)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    <Edit3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Ubah Template Ini</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Pilih Template Kontrak
                </label>
                <select
                  value={activeTemplate?.id ?? ''}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-900 focus:border-emerald-600 focus:outline-none"
                >
                  {allTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.scope === 'TENANT_CUSTOM' ? 'Custom Anda' : 'Standar Master'}] {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Nomor Kontrak
                  </label>
                  <input
                    type="text"
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Nama Pelanggan / Penyewa
                  </label>
                  <input
                    type="text"
                    data-testid="contract-customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    NIK / No. SIM / Identitas
                  </label>
                  <input
                    type="text"
                    value={customerIdNumber}
                    onChange={(e) => setCustomerIdNumber(e.target.value)}
                    placeholder="3273xxxxxxxxxxxx"
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    No. WhatsApp Pelanggan
                  </label>
                  <input
                    type="text"
                    data-testid="contract-customer-phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Unit / Objek Sewa / Lingkup Jasa
                </label>
                <input
                  type="text"
                  data-testid="contract-object-summary"
                  value={objectSummary}
                  onChange={(e) => setObjectSummary(e.target.value)}
                  placeholder="Contoh: Toyota Avanza 2024 (B 1234 XYZ) atau Desain Website Company Profile"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Tanggal Selesai / Kembali
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Nilai Kontrak (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={contractValue}
                    onChange={(e) => setContractValue(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs tabular-nums text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    DP / Deposit Jaminan (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={depositValue}
                    onChange={(e) => setDepositValue(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs tabular-nums text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Catatan / Klausul Tambahan
                </label>
                <textarea
                  rows={2}
                  value={catatanKhusus}
                  onChange={(e) => setCatatanKhusus(e.target.value)}
                  placeholder="Contoh: BBM wajib dikembalikan penuh; overtime Rp50.000/jam."
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-stone-100 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="save-contract-btn"
                  onClick={() => handleSaveContractRecord('DRAFT')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Simpan ke Arsip</span>
                </button>
                <button
                  type="button"
                  data-testid="download-contract-pdf-btn"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
                  <span>Unduh PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintContract}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                >
                  <Printer className="h-3.5 w-3.5 text-stone-600" strokeWidth={1.75} />
                  <span>Cetak</span>
                </button>
                {waDelivery.ok && waDelivery.url ? (
                  <a
                    href={waDelivery.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="send-contract-wa-link"
                    onClick={() => handleSaveContractRecord('SENT_WA')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-stone-800"
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.75} />
                    <span>Kirim via WhatsApp</span>
                  </a>
                ) : (
                  <span
                    className="inline-flex items-center text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5"
                    title={waDelivery.error}
                  >
                    {waDelivery.error}
                  </span>
                )}
              </div>
            </div>

            {/* Right Live Preview */}
            <div className="lg:col-span-6 rounded-xl border border-stone-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">Pratinjau Dokumen Kontrak</span>
                <span className="font-mono text-[11px] text-stone-500">{contractNumber}</span>
              </div>
              <pre
                data-testid="contract-live-preview"
                className="p-5 whitespace-pre-wrap font-sans text-xs leading-relaxed text-stone-800 max-h-[600px] overflow-y-auto"
              >
                {renderedText}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'TEMPLATES' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 rounded-xl border border-stone-200 bg-white overflow-hidden">
              <div className="p-4 border-b border-stone-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-stone-900">Daftar Template</h2>
                <button
                  type="button"
                  onClick={() => startCustomizeTemplate()}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Template Baru</span>
                </button>
              </div>
              <div className="divide-y divide-stone-100">
                {allTemplates.map((tpl) => (
                  <div key={tpl.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-900 truncate">{tpl.name}</p>
                      <p className="text-[11px] text-stone-500">
                        {CONTRACT_CATEGORY_LABELS[tpl.category]} ·{' '}
                        {tpl.scope === 'TENANT_CUSTOM' ? 'Custom Anda' : 'Standar Master'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startCustomizeTemplate(tpl)}
                        className="rounded-md border border-stone-200 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        {tpl.scope === 'TENANT_CUSTOM' ? 'Edit' : 'Duplikasi'}
                      </button>
                      {tpl.scope === 'TENANT_CUSTOM' && (
                        <button
                          type="button"
                          onClick={() => deleteTenantContractTemplate(tpl.id)}
                          aria-label={`Hapus template ${tpl.name}`}
                          className="rounded-md p-1 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleSaveCustomTemplate}
              className="lg:col-span-7 rounded-xl border border-stone-200 bg-white p-5 space-y-4"
            >
              <h2 className="text-sm font-bold text-stone-900">
                {editingTplId ? 'Editor Template Custom Usaha' : 'Pilih Template untuk Diedit atau Buat Baru'}
              </h2>
              {!editingTplId ? (
                <p className="text-xs text-stone-500">
                  Klik tombol <strong>Duplikasi</strong> pada template standar Master atau klik <strong>Template Baru</strong> untuk membuat klausul kontrak khusus usaha Anda.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Nama Template
                      </label>
                      <input
                        type="text"
                        required
                        value={tplName}
                        onChange={(e) => setTplName(e.target.value)}
                        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Kategori
                      </label>
                      <select
                        value={tplCategory}
                        onChange={(e) => setTplCategory(e.target.value as ContractCategory)}
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                      >
                        {(Object.keys(CONTRACT_CATEGORY_LABELS) as ContractCategory[]).map((cat) => (
                          <option key={cat} value={cat}>
                            {CONTRACT_CATEGORY_LABELS[cat]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Judul Header Dokumen
                    </label>
                    <input
                      type="text"
                      value={tplHeader}
                      onChange={(e) => setTplHeader(e.target.value)}
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Isi Klausul Kontrak (Gunakan variabel otomatis di bawah)
                    </label>
                    <textarea
                      rows={10}
                      required
                      value={tplBody}
                      onChange={(e) => setTplBody(e.target.value)}
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CONTRACT_PLACEHOLDER_GUIDE.map((p) => (
                        <button
                          key={p.token}
                          type="button"
                          onClick={() => setTplBody((prev) => `${prev}${prev.endsWith(' ') ? '' : ' '}${p.token}`)}
                          className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-[10px] text-stone-700 hover:border-emerald-400 hover:text-emerald-800"
                          title={`Sisipkan ${p.label}`}
                        >
                          {p.token}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Catatan Kaki / Penutup
                    </label>
                    <input
                      type="text"
                      value={tplFooter}
                      onChange={(e) => setTplFooter(e.target.value)}
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingTplId(null)}
                      className="rounded-lg border border-stone-200 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Simpan Template Custom
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        )}

        {activeTab === 'ARCHIVE' && (
          <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="px-4 py-3.5 border-b border-stone-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-stone-900">Arsip Kontrak Digital Tersimpan</h2>
              <span className="font-mono text-xs text-stone-500">{savedContracts.length} dokumen</span>
            </div>
            {savedContracts.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">
                Belum ada kontrak tersimpan. Buat kontrak di tab pertama lalu klik Simpan ke Arsip.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                      <th className="px-4 py-2.5">Nomor &amp; Tanggal</th>
                      <th className="px-4 py-2.5">Pelanggan &amp; Objek</th>
                      <th className="px-4 py-2.5 text-right">Nilai Kontrak</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {savedContracts.map((rec) => (
                      <tr key={rec.id}>
                        <td className="px-4 py-3">
                          <p className="font-mono font-bold text-stone-900">{rec.contractNumber}</p>
                          <p className="text-[11px] text-stone-500">
                            {rec.startDate} s/d {rec.endDate}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-stone-900">{rec.customerName}</p>
                          <p className="text-[11px] text-stone-500 truncate max-w-xs">
                            {rec.objectSummary}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-stone-900">
                          {formatRupiah(rec.contractValue)}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={rec.status}
                            onChange={(e) =>
                              updateDigitalContractStatus(
                                rec.id,
                                e.target.value as typeof rec.status
                              )
                            }
                            className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-800"
                          >
                            <option value="DRAFT">Draft Tersimpan</option>
                            <option value="SENT_WA">Terkirim WA</option>
                            <option value="SIGNED">Disetujui / Sah</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              downloadDigitalContractPdf({
                                contractNumber: rec.contractNumber,
                                headerTitle: rec.templateName,
                                businessName: tenant.name,
                                customerName: rec.customerName,
                                renderedText: rec.renderedText,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
                          >
                            <Download className="h-3 w-3 text-emerald-700" strokeWidth={1.75} />
                            <span>PDF</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
