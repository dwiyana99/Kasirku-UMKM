import React, { useMemo, useState } from 'react';
import { ArrowRight, ClipboardList, MessageCircle, ShoppingBag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getVerticalMeta } from '../lib/verticals/vertical-registry';
import { evaluateWhatsappSendingPolicy } from '../lib/messaging/whatsapp-policy';
import { canAccessRouteWithStaffPermissions } from '../lib/rbac/staff-rbac';
import { OwnerWaReminderModal } from '../components/whatsapp/OwnerWaReminderModal';
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
  const { activeWorkspace, navigate, hasAddOn, session } = useApp();
  const tenant = activeWorkspace.tenant;
  const meta = getVerticalMeta(tenant.vertical);
  const [waReminderModalOpen, setWaReminderModalOpen] = useState(false);

  const waPolicy = useMemo(
    () =>
      evaluateWhatsappSendingPolicy({
        businessWhatsappNumber: tenant.settings?.businessWhatsappNumber,
        hasFonnte: hasAddOn('ADDON_WA_FONNTE'),
      }),
    [tenant.settings?.businessWhatsappNumber, hasAddOn]
  );

  const canOpenSettings = canAccessRouteWithStaffPermissions('/settings/custom-fields', session);

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
          <p className="mt-1 max-w-[65ch] text-sm text-stone-600">{meta.headline}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {waPolicy.canShowSendButtons && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
              <span>
                {waPolicy.channel === 'FONNTE'
                  ? 'WA Gateway Fonnte Aktif'
                  : `WA Pemilik Aktif (${tenant.settings.businessWhatsappNumber})`}
              </span>
            </span>
          )}
          {meta.supportsPos && (
            <button
              type="button"
              data-testid="operations-open-pos-btn"
              onClick={() => navigate('/pos')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
              <span>{meta.primarySalesLabel || 'Buka Kasir Utama'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Owner WA Reminder Banner (Shown ONLY when Owner WA is unset & Fonnte is inactive) */}
      {waPolicy.needsOwnerWaReminder && (
        <section
          data-testid="operations-owner-wa-reminder"
          aria-label="Pengingat Nomor WhatsApp Pemilik"
          className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <MessageCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-800"
              strokeWidth={1.75}
            />
            <div className="text-xs leading-relaxed text-stone-700">
              <p className="font-semibold text-stone-900">
                Nomor WhatsApp Pemilik Belum Diisi
              </p>
              <p className="mt-0.5 max-w-[65ch]">
                Tombol kirim pengingat atau rincian pesanan ke WhatsApp pelanggan disembunyikan sementara sampai Anda menambahkan nomor WA pemilik di Pengaturan.
              </p>
            </div>
          </div>
          {canOpenSettings && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="operations-wa-quick-modal-btn"
                onClick={() => setWaReminderModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <span>Isi Nomor WA Sekarang</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings/custom-fields?tab=payments_wa')}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
              >
                <span>Pengaturan</span>
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          )}
        </section>
      )}

      {/* Active Vertical Dedicated Module */}
      {renderVerticalBody()}

      <OwnerWaReminderModal
        open={waReminderModalOpen}
        onClose={() => setWaReminderModalOpen(false)}
        contextLabel={`Kirim pengingat dan info ${meta.shortLabel} ke pelanggan`}
      />
    </div>
  );
}
