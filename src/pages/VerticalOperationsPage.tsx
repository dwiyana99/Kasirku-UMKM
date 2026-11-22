import React, { useState } from 'react';
import { CheckCircle2, ClipboardList, MessageCircle, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getVerticalMeta } from '../lib/verticals/vertical-registry';
import { checkDirectWaReadiness } from '../lib/messaging/whatsapp-direct';
import {
  HomestayVillaModule,
  RentalKendaraanModule,
  SewaGarasiModule,
  SewaLapanganModule,
} from '../components/operations/RentalAndPropertyOps';
import {
  BimbelKursusGymModule,
  GeneralVerticalOpsModule,
  LaundryOpsModule,
  ManufakturKecilModule,
} from '../components/operations/ServicesAndProductionOps';

export function VerticalOperationsPage() {
  const { activeWorkspace, updateTenantRegionalAndWa, navigate } = useApp();
  const tenant = activeWorkspace.tenant;
  const meta = getVerticalMeta(tenant.vertical);
  const waStatus = checkDirectWaReadiness(tenant.settings.businessWhatsappNumber);

  const [waInput, setWaInput] = useState(tenant.settings.businessWhatsappNumber ?? '');
  const [waSavedNotice, setWaSavedNotice] = useState(false);

  const handleSaveWa = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenantRegionalAndWa({ businessWhatsappNumber: waInput });
    setWaSavedNotice(true);
    setTimeout(() => setWaSavedNotice(false), 3000);
  };

  const renderVerticalBody = () => {
    switch (tenant.vertical) {
      case 'RENTAL_KENDARAAN':
        return <RentalKendaraanModule />;
      case 'HOMESTAY_VILLA':
        return <HomestayVillaModule />;
      case 'SEWA_LAPANGAN':
        return <SewaLapanganModule />;
      case 'SEWA_GARASI':
        return <SewaGarasiModule />;
      case 'LAUNDRY':
        return <LaundryOpsModule />;
      case 'BIMBEL_KURSUS_GYM':
        return <BimbelKursusGymModule />;
      case 'MANUFAKTUR_KECIL':
        return <ManufakturKecilModule />;
      default:
        return <GeneralVerticalOpsModule />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-stone-900">
            <ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={1.75} />
            <h1 className="text-xl font-bold tracking-[-0.02em] sm:text-2xl">
              {meta.dedicatedMenuLabel || `Operasional ${meta.shortLabel}`}
            </h1>
          </div>
          <p className="mt-1 max-w-[65ch] text-sm text-stone-600">{meta.laypersonTagline}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/pos')}
          className="inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
        >
          Buka Kasir Utama
        </button>
      </div>

      {/* Direct WhatsApp (wa.me) Quick Setup Banner — Free starting Paket LITE without Fonnte */}
      {meta.supportsDirectWa && (
        <form
          onSubmit={handleSaveWa}
          className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <MessageCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
              strokeWidth={1.75}
            />
            <div className="text-xs leading-relaxed text-emerald-950">
              <div className="font-bold">
                Kirim Pesan WhatsApp Langsung (wa.me) · Gratis Mulai Paket LITE Tanpa Add-On Fonnte
              </div>
              <p className="mt-0.5 text-emerald-800">
                {waStatus.isReady
                  ? `Nomor WA usaha aktif (${tenant.settings.businessWhatsappNumber}). Anda bisa langsung klik tombol Kirim WA di setiap transaksi.`
                  : 'Masukkan nomor WhatsApp usaha Anda sendiri di sebelah kanan agar tombol Kirim WA (wa.me) langsung aktif.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={waInput}
              onChange={(e) => setWaInput(e.target.value)}
              placeholder="Contoh: 0812-3456-7890"
              className="w-48 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
              Simpan Nomor WA
            </button>
            {waSavedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Tersimpan
              </span>
            )}
          </div>
        </form>
      )}

      {/* Active Vertical Dedicated Module */}
      {renderVerticalBody()}
    </div>
  );
}
