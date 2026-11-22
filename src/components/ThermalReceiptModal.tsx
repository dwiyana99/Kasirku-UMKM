import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Bluetooth, Check, Lock, MessageCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Order, Tenant } from '../types/domain';
import { buildEscPosReceiptCommands, formatRupiah } from '../lib/pos/checkout-service';
import {
  getDividerBorderClass,
  getEffectiveReceiptDesign,
} from '../lib/pos/receipt-design';
import { ModalShell } from './ui/ModalShell';
import { FonnteSendModal } from './whatsapp/FonnteSendModal';

interface ThermalReceiptModalProps {
  order: Order;
  tenant: Tenant;
  onClose: () => void;
  onPrinted?: () => void;
}

export function ThermalReceiptModal({
  order,
  tenant,
  onClose,
  onPrinted,
}: ThermalReceiptModalProps) {
  const { hasAddOn } = useApp();
  const hasFonnteWa = hasAddOn('ADDON_WA_FONNTE');
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>(
    tenant.settings.thermalPaperWidth || '80mm'
  );
  const [btStatus, setBtStatus] = useState<string | null>(null);
  const [fonnteOpen, setFonnteOpen] = useState(false);

  const waReceiptMessage = [
    `*${tenant.name.toUpperCase()}*`,
    tenant.address ? tenant.address : null,
    `No. Struk: ${order.orderNumber}`,
    `Pelanggan: ${order.customerName}`,
    '---',
    ...order.items.map((it) => {
      const sub = new Decimal(it.qty).times(new Decimal(it.unitPrice));
      return `${Number(it.qty)}x ${it.itemNameSnapshot} = ${formatRupiah(sub)}`;
    }),
    '---',
    `*TOTAL: ${formatRupiah(order.grandTotal)}*`,
    order.payment ? `Metode: ${order.payment.paymentMethod} (LUNAS)` : null,
    tenant.receiptFooter || 'Terima kasih!',
  ]
    .filter(Boolean)
    .join('\n');

  const design = getEffectiveReceiptDesign(tenant);
  const dividerClass = getDividerBorderClass(design.dividerStyle);
  const logoSizeClass =
    design.logoSize === 'sm'
      ? 'w-10 h-10'
      : design.logoSize === 'lg'
      ? 'w-16 h-16'
      : 'w-12 h-12';

  const handleBrowserPrint = () => {
    window.print();
    onPrinted?.();
  };

  const handleBluetoothEscPos = async () => {
    const commands = buildEscPosReceiptCommands(order, {
      ...tenant,
      settings: { ...tenant.settings, thermalPaperWidth: paperWidth },
    });

    const nav = navigator as Navigator & {
      bluetooth?: {
        requestDevice: (opts: unknown) => Promise<{
          gatt?: {
            connect: () => Promise<{
              getPrimaryServices: () => Promise<
                Array<{
                  getCharacteristics: () => Promise<
                    Array<{
                      properties: { write?: boolean; writeWithoutResponse?: boolean };
                      writeValue: (val: BufferSource) => Promise<void>;
                    }>
                  >;
                }>
              >;
            }>;
          };
        }>;
      };
    };

    if (!nav.bluetooth) {
      setBtStatus(
        `Perintah ESC/POS (${commands.byteLength} bytes, ${paperWidth}) siap. Browser ini tidak mendukung Web Bluetooth—gunakan tombol Cetak Struk untuk printer sistem.`
      );
      return;
    }

    try {
      setBtStatus('Mencari printer thermal Bluetooth...');
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
      });
      const server = await device.gatt?.connect();
      const services = await server?.getPrimaryServices();
      if (services && services.length > 0) {
        const chars = await services[0].getCharacteristics();
        const writable = chars.find(
          (c) => c.properties.write || c.properties.writeWithoutResponse
        );
        if (writable) {
          await writable.writeValue(commands.slice().buffer);
          setBtStatus('Struk berhasil dikirim ke printer Bluetooth ESC/POS.');
          onPrinted?.();
          return;
        }
      }
      setBtStatus('Printer terhubung, namun karakteristik tulis ESC/POS tidak ditemukan.');
    } catch {
      setBtStatus(
        `Koneksi Bluetooth dibatalkan. Buffer ESC/POS (${commands.byteLength} bytes) tetap siap dicetak via printer USB/OS.`
      );
    }
  };

  const hasDiscount = new Decimal(order.discountAmount).gt(0);
  const hasService = new Decimal(order.serviceCharge).gt(0);
  const hasTax = new Decimal(order.taxAmount).gt(0);

  return (
    <ModalShell
      open={true}
      onClose={onClose}
      headerId="thermal-receipt-modal-header"
      testId="thermal-receipt-modal"
      title="Struk Thermal POS"
      subtitle="Format 58mm / 80mm kompatibel ESC/POS · Mengikuti pengaturan Desainer Struk"
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setFonnteOpen(true)}
            data-testid="receipt-send-whatsapp-btn"
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg transition-colors whitespace-nowrap ${
              hasFonnteWa
                ? 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200'
            }`}
          >
            {hasFonnteWa ? (
              <MessageCircle className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            <span>{hasFonnteWa ? 'Kirim WA (Fonnte)' : 'Kirim WA (Add-On)'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleBluetoothEscPos()}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Bluetooth className="w-3.5 h-3.5" />
            <span>Bluetooth</span>
          </button>
          <button
            type="button"
            data-testid="receipt-skip-print-btn"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <span>Selesai Tanpa Cetak</span>
          </button>
          <button
            type="button"
            onClick={handleBrowserPrint}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak ({paperWidth})</span>
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* Paper Width Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(['58mm', '80mm'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setPaperWidth(w)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                paperWidth === w ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Kertas {w}
            </button>
          ))}
        </div>

        {/* Printable Thermal Receipt Surface */}
        <div
          id="thermal-receipt-printable"
          className={`bg-white border border-slate-200 p-5 font-mono text-xs text-slate-900 tabular-nums transition-all ${
            paperWidth === '58mm' ? 'w-[252px]' : 'w-[332px]'
          }`}
        >
          <div
            className={`space-y-1 pb-3 ${dividerClass} ${
              design.headerAlignment === 'left' ? 'text-left' : 'text-center'
            }`}
          >
            {design.brandingBannerUrl && (
              <img
                src={design.brandingBannerUrl}
                alt="Banner Struk"
                className="w-full max-h-16 object-contain mb-2 rounded"
              />
            )}
            {design.showLogo && tenant.logoUrl && (
              <img
                src={tenant.logoUrl}
                alt={`Logo ${tenant.name}`}
                referrerPolicy="no-referrer"
                className={`${logoSizeClass} ${
                  design.headerAlignment === 'left' ? '' : 'mx-auto'
                } mb-1.5 rounded-lg object-cover border border-slate-200`}
              />
            )}
            <p className="font-bold text-sm tracking-tight">{tenant.name.toUpperCase()}</p>
            {design.headerTagline.trim() && (
              <p className="text-[11px] text-slate-700 italic">{design.headerTagline.trim()}</p>
            )}
            {design.showAddress && (
              <p className="text-[11px] text-slate-600 leading-snug">{tenant.address}</p>
            )}
            {design.showNpwp && tenant.npwp16 && (
              <p className="text-[10px] text-slate-500">NPWP: {tenant.npwp16}</p>
            )}
          </div>

          <div className={`py-2.5 space-y-1 ${dividerClass} text-[11px]`}>
            <div className="flex justify-between">
              <span>No</span>
              <span>{order.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Waktu</span>
              <span>{new Date(order.createdAt).toLocaleString('id-ID')}</span>
            </div>
            {design.showCustomerInfo && (
              <>
                <div className="flex justify-between">
                  <span>Pelanggan</span>
                  <span>{order.customerName}</span>
                </div>
                {order.tableNumber && (
                  <div className="flex justify-between">
                    <span>Meja</span>
                    <span>Meja {order.tableNumber}</span>
                  </div>
                )}
                {order.stylistName && (
                  <div className="flex justify-between">
                    <span>Kapster/Stylist</span>
                    <span>{order.stylistName}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={`py-2.5 space-y-2 ${dividerClass}`}>
            {order.items.map((item) => {
              const lineTotal = new Decimal(item.qty).times(new Decimal(item.unitPrice));
              return (
                <div key={item.id} className="space-y-0.5">
                  <p className="font-medium text-slate-900">{item.itemNameSnapshot}</p>
                  <div className="flex justify-between text-[11px] text-slate-600">
                    <span>
                      {Number(item.qty)} x {formatRupiah(item.unitPrice)}
                    </span>
                    <span className="text-slate-900">{formatRupiah(lineTotal)}</span>
                  </div>
                  {design.showItemNotes && item.notes && (
                    <p className="text-[10px] text-slate-500 italic">Catatan: {item.notes}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className={`py-2.5 space-y-1 ${dividerClass} text-[11px]`}>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatRupiah(order.subtotal)}</span>
            </div>
            {design.showDiscountLine && hasDiscount && (
              <div className="flex justify-between">
                <span>Diskon</span>
                <span>-{formatRupiah(order.discountAmount)}</span>
              </div>
            )}
            {design.showServiceChargeLine && hasService && (
              <div className="flex justify-between">
                <span>Service Charge</span>
                <span>{formatRupiah(order.serviceCharge)}</span>
              </div>
            )}
            {design.showTaxLine && hasTax && order.taxType === 'PPN_11_12' && (
              <>
                {design.showDppDetailLine && (
                  <div className="flex justify-between text-slate-500">
                    <span>DPP Nilai Lain (11/12)</span>
                    <span>{formatRupiah(order.dppNilaiLain)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>PPN 12% × DPP</span>
                  <span>{formatRupiah(order.taxAmount)}</span>
                </div>
              </>
            )}
            {design.showTaxLine && hasTax && order.taxType === 'PB1_RESTO_10' && (
              <div className="flex justify-between">
                <span>PB1 Restoran (10%)</span>
                <span>{formatRupiah(order.taxAmount)}</span>
              </div>
            )}
            {design.showTaxLine && hasTax && order.taxType === 'PPN_12' && (
              <div className="flex justify-between">
                <span>PPN 12%</span>
                <span>{formatRupiah(order.taxAmount)}</span>
              </div>
            )}
          </div>

          <div className={`py-2.5 space-y-1 ${dividerClass}`}>
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL</span>
              <span>{formatRupiah(order.grandTotal)}</span>
            </div>
            {order.payment && (
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>Metode: {order.payment.paymentMethod}</span>
                <span>LUNAS</span>
              </div>
            )}
          </div>

          {design.showFeedbackQr && design.feedbackQrUrl.trim() && (
            <div className={`py-3 flex flex-col items-center gap-1.5 ${dividerClass}`}>
              <p className="text-[10px] font-medium text-slate-700 text-center">
                {design.feedbackQrLabel || 'Scan untuk beri ulasan'}
              </p>
              <div className="p-1.5 bg-white border border-slate-200 rounded">
                <QRCodeSVG value={design.feedbackQrUrl.trim()} size={88} level="M" />
              </div>
            </div>
          )}

          {design.showFooter && tenant.receiptFooter && (
            <p className="pt-3 text-center text-[11px] text-slate-600 leading-relaxed">
              {tenant.receiptFooter}
            </p>
          )}
          {design.showPoweredBy && (
            <p className="pt-2 text-center text-[10px] text-slate-400">KasirAkun UMKM</p>
          )}
        </div>

        {btStatus && (
          <div className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-700 flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{btStatus}</span>
          </div>
        )}
      </div>

      <FonnteSendModal
        open={fonnteOpen}
        onClose={() => setFonnteOpen(false)}
        title={`Kirim Struk ${order.orderNumber} via WhatsApp (Fonnte)`}
        defaultPhone={order.customerPhoneWa ?? ''}
        defaultMessage={waReceiptMessage}
        documentType="RECEIPT"
        referenceNo={order.orderNumber}
      />
    </ModalShell>
  );
}
