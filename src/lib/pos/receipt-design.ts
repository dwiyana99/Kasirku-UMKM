/**
 * KasirAkun UMKM — Thermal Receipt Designer Configuration & Helpers
 * Pure helper utilities shared by ReceiptDesigner, ThermalReceiptModal, and ESC/POS builder.
 */

import type { ReceiptDesignConfig, Tenant } from '../../types/domain.ts';

export function getDefaultReceiptDesign(tenant?: Pick<Tenant, 'slug' | 'vertical'>): ReceiptDesignConfig {
  const slug = tenant?.slug || 'umkm';
  return {
    showLogo: true,
    logoSize: 'md',
    brandingBannerUrl: '',
    headerAlignment: 'center',
    headerTagline: '',
    showAddress: true,
    showNpwp: true,
    showCustomerInfo: true,
    showCashierInfo: true,
    showItemNotes: true,
    showDiscountLine: true,
    showServiceChargeLine: true,
    showTaxLine: true,
    showDppDetailLine: true,
    dividerStyle: 'dashed',
    showFeedbackQr: false,
    feedbackQrUrl: `https://kasirakun.id/feedback/${slug}`,
    feedbackQrLabel: 'Scan untuk Kritik & Saran',
    showFooter: true,
    showPoweredBy: true,
  };
}

export function getEffectiveReceiptDesign(tenant: Tenant): ReceiptDesignConfig {
  const defaults = getDefaultReceiptDesign(tenant);
  const custom = tenant.settings?.receiptDesign;
  if (!custom) return defaults;
  return {
    ...defaults,
    ...custom,
  };
}

export function getDividerBorderClass(style: ReceiptDesignConfig['dividerStyle']): string {
  switch (style) {
    case 'dotted':
      return 'border-dotted border-slate-400';
    case 'solid':
      return 'border-solid border-slate-300';
    case 'double':
      return 'border-double border-t-4 border-slate-400';
    case 'dashed':
    default:
      return 'border-dashed border-slate-300';
  }
}

export function getEscPosDividerChar(style: ReceiptDesignConfig['dividerStyle']): string {
  switch (style) {
    case 'dotted':
      return '.';
    case 'double':
      return '=';
    case 'solid':
      return '_';
    case 'dashed':
    default:
      return '-';
  }
}
