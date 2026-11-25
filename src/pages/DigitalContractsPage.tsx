import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  FileSignature,
  Lock,
  MessageCircle,
  Plus,
  Printer,
  Save,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { OwnerWaReminderModal } from '../components/whatsapp/OwnerWaReminderModal';
import { UnifiedWaActionButton } from '../components/whatsapp/UnifiedWaActionButton';
import { useApp } from '../context/AppContext';
import {
  buildDigitalContractPrintHtml,
  CONTRACT_CATEGORY_LABELS,
  CONTRACT_PLACEHOLDER_GUIDE,
  downloadDigitalContractPdf,
  getContractFormMetaForVertical,
  getDynamicContractServiceOptions,
  getTemplatesForVertical,
  renderContractTemplate,
  verticalSupportsDigitalContracts,
} from '../lib/contracts/digital-contract-engine';
import {
  DEFAULT_KOST_ADDON_CATALOG,
  DEFAULT_KOST_INCLUDED_FACILITIES,
} from '../lib/verticals/kost-facilities';
import { formatDateIndo, getTodayIsoDate } from '../lib/date/indonesia-date';
import { evaluateWhatsappSendingPolicy } from '../lib/messaging/whatsapp-policy';
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
    hasAddOn,
    navigate,
  } = useApp();

  const tenant = activeWorkspace.tenant;
  const isSupported = verticalSupportsDigitalContracts(tenant.vertical, tenant.subscriptionPlan);
  const formMeta = useMemo(() => getContractFormMetaForVertical(tenant.vertical), [tenant.vertical]);

  const customTemplates = activeWorkspace.contractTemplates ?? [];
  const rawAllTemplates = useMemo(
    () => [...customTemplates, ...globalContractTemplates],
    [customTemplates, globalContractTemplates]
  );

  // STRICT vertical lock: ONLY templates belonging to active UMKM vertical are visible/selectable.
  const verticalTemplates = useMemo(
    () => getTemplatesForVertical(tenant.vertical, rawAllTemplates),
    [rawAllTemplates, tenant.vertical]
  );

  const waPolicy = useMemo(
    () =>
      evaluateWhatsappSendingPolicy({
        businessWhatsappNumber: tenant.settings.businessWhatsappNumber,
        hasFonnte: hasAddOn('ADDON_WA_FONNTE'),
      }),
    [tenant.settings.businessWhatsappNumber, hasAddOn]
  );

  const [activeTab, setActiveTab] = useState<'CREATE' | 'TEMPLATES' | 'ARCHIVE'>('CREATE');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    verticalTemplates[0]?.id ?? ''
  );
  const [waReminderModalOpen, setWaReminderModalOpen] = useState(false);

  useEffect(() => {
    if (!verticalTemplates.some((t) => t.id === selectedTemplateId)) {
      setSelectedTemplateId(verticalTemplates[0]?.id ?? '');
    }
  }, [selectedTemplateId, verticalTemplates]);

  const todayStr = getTodayIsoDate();
  const [contractNumber, setContractNumber] = useState(
    `KTR-${todayStr.replace(/-/g, '')}-${String(Date.now()).slice(-3)}`
  );
  const [customerName, setCustomerName] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [objectSummary, setObjectSummary] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [contractValue, setContractValue] = useState(
    tenant.vertical === 'KOST_KONTRAKAN' ? '1850000' : '500000'
  );
  const [depositValue, setDepositValue] = useState(
    tenant.vertical === 'KOST_KONTRAKAN' ? '1000000' : '150000'
  );
  const [catatanKhusus, setCatatanKhusus] = useState('');
  const [selectedServiceOptionId, setSelectedServiceOptionId] = useState('');
  const [kostRoomLabel, setKostRoomLabel] = useState('');
  const [kostIncludedChips, setKostIncludedChips] = useState<string[]>([
    'Air PDAM',
    'Listrik',
    'Wi-Fi',
    'Kasur & Lemari',
    'AC',
  ]);
  const [kostContractAddOns, setKostContractAddOns] = useState<
    Array<{ id: string; name: string; monthlyFee: string }>
  >([]);
  const [notice, setNotice] = useState<string | null>(null);

  const isKost = tenant.vertical === 'KOST_KONTRAKAN';

  // Dynamically filter available services/units strictly by active UMKM vertical
  const dynamicServiceOptions = useMemo(
    () => getDynamicContractServiceOptions(tenant.vertical, activeWorkspace),
    [tenant.vertical, activeWorkspace]
  );

  const applyDynamicServiceOption = (optionId: string) => {
    setSelectedServiceOptionId(optionId);
    const chosen = dynamicServiceOptions.find((o) => o.id === optionId);
    if (!chosen) return;
    setObjectSummary(chosen.objectSummary);
    if (chosen.customerName) setCustomerName(chosen.customerName);
    if (chosen.customerIdNumber) setCustomerIdNumber(chosen.customerIdNumber);
    if (chosen.customerPhone) setCustomerPhone(chosen.customerPhone);
    if (chosen.startDate) setStartDate(chosen.startDate);
    if (chosen.endDate) setEndDate(chosen.endDate);
    if (chosen.contractValue) setContractValue(chosen.contractValue);
    if (chosen.depositValue) setDepositValue(chosen.depositValue);
    if (isKost) {
      const roomPart = chosen.objectSummary.split(' · Include:')[0] || chosen.label;
      setKostRoomLabel(roomPart);
      if (chosen.includedFacilities) setKostIncludedChips(chosen.includedFacilities);
      const addOns = chosen.facilityAddOns ?? [];
      setKostContractAddOns(addOns);
      if (addOns.length > 0) {
        const addOnText = addOns
          .map((a) => `${a.name} (${formatRupiah(a.monthlyFee)}/bln)`)
          .join(', ');
        setCatatanKhusus(`Add-On Fasilitas Ekstra: ${addOnText}`);
      } else {
        setCatatanKhusus('');
      }
    } else if (chosen.extraNotes) {
      setCatatanKhusus(chosen.extraNotes);
    }
  };

  const toggleKostIncludedChip = (fac: string) => {
    const next = kostIncludedChips.includes(fac)
      ? kostIncludedChips.filter((f) => f !== fac)
      : [...kostIncludedChips, fac];
    setKostIncludedChips(next);
    const baseRoom = kostRoomLabel.trim() || objectSummary.split(' · Include:')[0] || 'Kamar Kost';
    setObjectSummary(
      next.length > 0 ? `${baseRoom} · Include: ${next.join(', ')}` : baseRoom
    );
  };

  const toggleKostContractAddOn = (code: string, name: string, monthlyFee: string) => {
    const exists = kostContractAddOns.some((a) => a.name === name);
    const next = exists
      ? kostContractAddOns.filter((a) => a.name !== name)
      : [...kostContractAddOns, { id: `cao-${code}`, name, monthlyFee }];
    setKostContractAddOns(next);
    const addOnText = next
      .map((a) => `${a.name} (${formatRupiah(a.monthlyFee)}/bln)`)
      .join(', ');
    setCatatanKhusus(
      next.length > 0 ? `Add-On Fasilitas Ekstra: ${addOnText}` : ''
    );
  };

  // Template customization editor state
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<ContractCategory>(formMeta.defaultCategory);
  const [tplHeader, setTplHeader] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplFooter, setTplFooter] = useState('');

  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const activeTemplate = useMemo(
    () =>
      verticalTemplates.find((t) => t.id === selectedTemplateId) ??
      verticalTemplates[0],
    [selectedTemplateId, verticalTemplates]
  );

  const renderedText = useMemo(() => {
    if (!activeTemplate) return '';
    return renderContractTemplate(activeTemplate, {
      nomorKontrak: contractNumber,
      tanggalKontrak: todayStr,
      namaUsaha: tenant.name,
      alamatUsaha: tenant.address,
      waUsaha: tenant.settings.businessWhatsappNumber || '-',
      namaPelanggan: customerName || `[${formMeta.partyLabel}]`,
      nikPelanggan: customerIdNumber || '-',
      waPelanggan: customerPhone || '-',
      objekLayanan: objectSummary || `[${formMeta.objectLabel}]`,
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
    formMeta.objectLabel,
    formMeta.partyLabel,
    objectSummary,
    startDate,
    tenant.address,
    tenant.name,
    tenant.settings.businessWhatsappNumber,
    todayStr,
  ]);

  const contractWaMessage = useMemo(
    () =>
      [
        `Halo *${customerName || 'Pelanggan'}*,`,
        `Berikut salinan *Perjanjian Digital* dari *${tenant.name}* (No: ${contractNumber}):`,
        '',
        renderedText,
        '',
        `Mohon balas *"SETUJU"* pada pesan ini sebagai tanda persetujuan digital Anda. Terima kasih.`,
      ].join('\n'),
    [contractNumber, customerName, renderedText, tenant.name]
  );

  const handleSaveContractRecord = (status: 'DRAFT' | 'SENT_WA' = 'DRAFT') => {
    if (!activeTemplate) return;
    if (!customerName.trim() || !objectSummary.trim()) {
      setNotice(`Lengkapi ${formMeta.partyLabel} dan ${formMeta.objectLabel} terlebih dahulu.`);
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
      setTplCategory(formMeta.defaultCategory);
      setTplHeader(tpl.headerTitle);
      setTplBody(tpl.bodyTemplate);
      setTplFooter(tpl.footerTerms);
    } else {
      setEditingTplId(`custom-${Date.now()}`);
      setTplName(`Template ${formMeta.verticalLabel} (Custom)`);
      setTplCategory(formMeta.defaultCategory);
      setTplHeader(`SURAT PERJANJIAN ${formMeta.verticalLabel.toUpperCase()}`);
      setTplBody(
        'Nomor: {{nomor_kontrak}}\nTanggal: {{tanggal_kontrak}}\n\nPihak Pertama: {{nama_usaha}}\nPihak Kedua: {{nama_pelanggan}} (WA: {{wa_pelanggan}})\n\nObjek / Layanan: {{objek_layanan}}\nPeriode: {{tanggal_mulai}} s/d {{tanggal_selesai}}\nNilai: {{nilai_kontrak}} | Deposit/DP: {{nilai_deposit}}\n\nCatatan: {{catatan_khusus}}'
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
      category: formMeta.allowedCategories.includes(tplCategory)
        ? tplCategory
        : formMeta.defaultCategory,
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
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Kembali ke Ringkasan
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Generator Kontrak Digital"
      subtitle={`Buat surat perjanjian khusus ${formMeta.verticalLabel}, unduh PDF, cetak, atau kirim lewat WhatsApp.`}
    >
      <div className="space-y-5" data-testid="digital-contracts-page">
        <iframe
          ref={printFrameRef}
          title="Pratinjau Cetak Kontrak"
          className="hidden"
        />

        {/* Strict Vertical Lock Indicator */}
        <div
          data-testid="contract-vertical-lock-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-700"
        >
          <span className="inline-flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>
              Template terkunci otomatis khusus usaha{' '}
              <strong className="text-stone-900">{formMeta.verticalLabel}</strong> agar tidak
              tercampur dengan jenis usaha lain.
            </span>
          </span>
          <span className="font-mono text-[11px] font-semibold text-stone-500">
            {verticalTemplates.length} template aktif
          </span>
        </div>

        {/* Owner WA Reminder Banner when Owner WA unset & Fonnte inactive */}
        {waPolicy.needsOwnerWaReminder && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-stone-700">
            <span className="inline-flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-amber-800 shrink-0" strokeWidth={1.75} />
              <span>
                Isi <strong>Nomor WhatsApp Pemilik</strong> di Pengaturan untuk menampilkan tombol kirim kontrak lewat WhatsApp.
              </span>
            </span>
            <button
              type="button"
              onClick={() => setWaReminderModalOpen(true)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Isi Nomor WA Sekarang
            </button>
          </div>
        )}

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
            Kustomisasi Template ({verticalTemplates.length})
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
                  Pilih Template Kontrak ({formMeta.verticalLabel})
                </label>
                <select
                  data-testid="contract-template-select"
                  value={activeTemplate?.id ?? ''}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-900 focus:border-emerald-600 focus:outline-none"
                >
                  {verticalTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.scope === 'TENANT_CUSTOM' ? 'Custom Anda' : 'Standar Usaha'}] {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Vertical Service / Unit Selector */}
              {dynamicServiceOptions.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5">
                  <label
                    htmlFor="contract-dynamic-service-select"
                    className="block text-xs font-semibold text-emerald-950"
                  >
                    {isKost
                      ? 'Pilih Kamar / Penghuni Kost (Isi Otomatis)'
                      : `Pilih Unit / Layanan Aktif (${formMeta.verticalLabel})`}
                  </label>
                  <select
                    id="contract-dynamic-service-select"
                    data-testid="contract-dynamic-service-select"
                    value={selectedServiceOptionId}
                    onChange={(e) => applyDynamicServiceOption(e.target.value)}
                    className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-stone-900 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="">
                      {isKost
                        ? '-- Pilih kamar atau penghuni kost aktif --'
                        : '-- Pilih layanan/unit yang tersedia untuk isi cepat --'}
                    </option>
                    {dynamicServiceOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                    {formMeta.partyLabel}
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
                    {formMeta.idLabel}
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
                    No. WhatsApp
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

              {isKost ? (
                <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/70 p-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Detail Kamar &amp; Tipe Hunian (Khusus Kost)
                    </label>
                    <input
                      type="text"
                      data-testid="contract-object-summary"
                      value={objectSummary}
                      onChange={(e) => {
                        setObjectSummary(e.target.value);
                        setKostRoomLabel(e.target.value.split(' · Include:')[0] || '');
                      }}
                      placeholder={formMeta.objectPlaceholder}
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-stone-700 mb-1.5">
                      Fasilitas Sudah Termasuk di Kamar (Include Harga Sewa)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_KOST_INCLUDED_FACILITIES.map((fac) => {
                        const active = kostIncludedChips.includes(fac);
                        return (
                          <button
                            key={fac}
                            type="button"
                            onClick={() => toggleKostIncludedChip(fac)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                              active
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            {active ? '✓ ' : '+ '}
                            {fac}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div data-testid="contract-kost-addons-picker">
                    <p className="text-[11px] font-semibold text-stone-700 mb-1.5">
                      Add-On Fasilitas Ekstra Modular (Opsional, di luar Include Kamar)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_KOST_ADDON_CATALOG.map((item) => {
                        const selected = kostContractAddOns.some((a) => a.name === item.name);
                        return (
                          <button
                            key={item.code}
                            type="button"
                            data-testid={`contract-kost-addon-${item.code}`}
                            onClick={() =>
                              toggleKostContractAddOn(item.code, item.name, item.defaultMonthlyFee)
                            }
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                              selected
                                ? 'bg-stone-900 text-white border-stone-900'
                                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            {selected ? '✓ ' : '+ '}
                            {item.name} ({formatRupiah(item.defaultMonthlyFee)}/bln)
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {formMeta.objectLabel}
                  </label>
                  <input
                    type="text"
                    data-testid="contract-object-summary"
                    value={objectSummary}
                    onChange={(e) => setObjectSummary(e.target.value)}
                    placeholder={formMeta.objectPlaceholder}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {formMeta.startDateLabel}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-stone-500">
                    Tampilan: {formatDateIndo(startDate)}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {formMeta.endDateLabel}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-stone-500">
                    Tampilan: {formatDateIndo(endDate)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {formMeta.valueLabel}
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
                    {formMeta.depositLabel}
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
                  {formMeta.extraNotesLabel}
                </label>
                <textarea
                  rows={2}
                  data-testid="contract-extra-notes"
                  value={catatanKhusus}
                  onChange={(e) => setCatatanKhusus(e.target.value)}
                  placeholder={formMeta.extraNotesPlaceholder}
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
                {waPolicy.canShowSendButtons && customerPhone.trim() && (
                  <UnifiedWaActionButton
                    customerPhone={customerPhone}
                    customerName={customerName || 'Pelanggan'}
                    message={contractWaMessage}
                    modalTitle={`Kirim Kontrak Digital (${contractNumber})`}
                    documentType="INVOICE"
                    referenceNo={contractNumber}
                    label="Kirim via WhatsApp"
                    variant="emerald"
                    testId="send-contract-wa-link"
                  />
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
                <h2 className="text-sm font-bold text-stone-900">
                  Daftar Template ({formMeta.verticalLabel})
                </h2>
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
                {verticalTemplates.map((tpl) => (
                  <div key={tpl.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-900 truncate">{tpl.name}</p>
                      <p className="text-[11px] text-stone-500">
                        {CONTRACT_CATEGORY_LABELS[tpl.category]} ·{' '}
                        {tpl.scope === 'TENANT_CUSTOM' ? 'Custom Anda' : 'Standar Usaha'}
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
                  Klik tombol <strong>Duplikasi</strong> pada template standar usaha atau klik{' '}
                  <strong>Template Baru</strong> untuk membuat klausul kontrak khusus{' '}
                  {formMeta.verticalLabel}.
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
                        Kategori Usaha (Terkunci)
                      </label>
                      <select
                        value={tplCategory}
                        onChange={(e) => setTplCategory(e.target.value as ContractCategory)}
                        disabled={formMeta.allowedCategories.length <= 1}
                        className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700 focus:border-emerald-600 focus:outline-none disabled:opacity-90"
                      >
                        {formMeta.allowedCategories.map((cat) => (
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
                          onClick={() =>
                            setTplBody((prev) => `${prev}${prev.endsWith(' ') ? '' : ' '}${p.token}`)
                          }
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
                      <th className="px-4 py-2.5">Nomor &amp; Periode</th>
                      <th className="px-4 py-2.5">{formMeta.partyLabel} &amp; Objek</th>
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
                            {formatDateIndo(rec.startDate)} s/d {formatDateIndo(rec.endDate)}
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

      <OwnerWaReminderModal
        open={waReminderModalOpen}
        onClose={() => setWaReminderModalOpen(false)}
        contextLabel="mengirim salinan kontrak digital via WhatsApp"
      />
    </AppShell>
  );
}
