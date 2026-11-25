/**
 * Pure jsPDF Generator for Tier-1 Simple Financial Reports & Dashboard Revenue Summary.
 * Works reliably across desktop, mobile browsers, and iframes (unlike window.print()).
 * 100% Zero AI Token, Decimal.js precision, plain layperson Indonesian (no debit/credit jargon).
 */

import Decimal from 'decimal.js';
import { jsPDF } from 'jspdf';
import type { Tier1PeriodReport } from '../accounting/tier1-period-report';
import type { DailyRevenuePoint } from '../analytics/dashboard-analytics';

function formatRupiahPdf(val: string | number): string {
  const num = new Decimal(val || '0').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const absStr = num.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return num.isNeg() ? `-Rp${absStr}` : `Rp${absStr}`;
}

function slugifyFilePart(str: string): string {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'usaha'
  );
}

/**
 * Builds an A4 jsPDF document for the Tier-1 Simple Financial Report.
 */
export function buildTier1ReportPdfDoc(params: {
  tenantName: string;
  report: Tier1PeriodReport;
  generatedAt?: Date;
}): jsPDF {
  const { tenantName, report, generatedAt = new Date() } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(28, 25, 23); // Stone 900
  doc.text(tenantName, margin, y);
  y += 6.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(5, 150, 105); // Deep Emerald
  doc.text(report.periodLabel, margin, y);
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(87, 83, 78); // Stone 600
  const printedLabel = generatedAt.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(
    `Periode: ${report.rangeLabel}  |  ${report.orderCount} transaksi lunas  |  Dicetak: ${printedLabel}`,
    margin,
    y
  );
  y += 4;

  doc.setDrawColor(231, 229, 228); // Stone 200
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // 4-Box KPI Summary Row
  const boxW = (contentWidth - 9) / 4;
  const boxH = 22;
  const kpis = [
    {
      label: 'Penjualan Bersih',
      value: formatRupiahPdf(report.netSales),
      sub: `${report.orderCount} transaksi`,
      accent: [28, 25, 23] as const,
    },
    {
      label: 'Modal Barang (HPP)',
      value: formatRupiahPdf(report.totalHpp),
      sub: `Untung kotor ${formatRupiahPdf(report.grossProfit)}`,
      accent: [68, 64, 60] as const,
    },
    {
      label: 'Total Biaya Usaha',
      value: formatRupiahPdf(report.totalExpenses),
      sub: `${report.expenseCount} pengeluaran`,
      accent: [190, 18, 60] as const,
    },
    {
      label: 'Untung (Rugi) Bersih',
      value: formatRupiahPdf(report.netProfit),
      sub: `Margin ${report.netMarginPct}%`,
      accent: new Decimal(report.netProfit).gte(0)
        ? ([5, 150, 105] as const)
        : ([190, 18, 60] as const),
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (boxW + 3);
    doc.setFillColor(250, 250, 249);
    doc.setDrawColor(231, 229, 228);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 113, 108);
    doc.text(kpi.label, x + 3, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(kpi.accent[0], kpi.accent[1], kpi.accent[2]);
    doc.text(kpi.value, x + 3, y + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 113, 108);
    doc.text(kpi.sub, x + 3, y + 18.5);
  });
  y += boxH + 10;

  // Section 1: Rincian Untung Rugi Sederhana
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text(`Rincian Untung Rugi (${report.rangeLabel})`, margin, y);
  y += 6;

  const plRows: Array<{ label: string; value: string; bold?: boolean; emerald?: boolean; rose?: boolean }> = [
    { label: 'Penjualan Kotor', value: formatRupiahPdf(report.grossSales) },
    ...(new Decimal(report.discountTotal).gt(0)
      ? [{ label: 'Potongan / Diskon', value: `-${formatRupiahPdf(report.discountTotal)}`, rose: true }]
      : []),
    { label: 'Penjualan Bersih', value: formatRupiahPdf(report.netSales), bold: true },
    { label: 'Modal Barang Terjual (HPP)', value: `-${formatRupiahPdf(report.totalHpp)}` },
    { label: 'Untung Kotor', value: formatRupiahPdf(report.grossProfit), bold: true },
    { label: 'Biaya Operasional Usaha', value: `-${formatRupiahPdf(report.totalExpenses)}`, rose: true },
    {
      label: 'Untung (Rugi) Bersih Periode Ini',
      value: formatRupiahPdf(report.netProfit),
      bold: true,
      emerald: new Decimal(report.netProfit).gte(0),
      rose: new Decimal(report.netProfit).lt(0),
    },
  ];

  plRows.forEach((row) => {
    doc.setDrawColor(245, 245, 244);
    doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 10 : 9.5);
    doc.setTextColor(28, 25, 23);
    doc.text(row.label, margin, y);

    if (row.emerald) {
      doc.setTextColor(5, 150, 105);
    } else if (row.rose) {
      doc.setTextColor(190, 18, 60);
    } else {
      doc.setTextColor(28, 25, 23);
    }
    doc.text(row.value, pageWidth - margin, y, { align: 'right' });
    y += 7.5;
  });

  y += 6;

  // Section 2: Penerimaan Tunai vs Non-Tunai
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text('Penerimaan Uang (Tunai vs Non-Tunai)', margin, y);
  y += 6;

  const paymentRows = [
    { label: 'Uang Tunai (Laci Kasir)', value: formatRupiahPdf(report.cashSales), emerald: true },
    { label: 'Non-Tunai (QRIS / Transfer / E-Wallet)', value: formatRupiahPdf(report.nonCashSales), emerald: false },
  ];

  paymentRows.forEach((row) => {
    doc.setDrawColor(245, 245, 244);
    doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(68, 64, 60);
    doc.text(row.label, margin, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(row.emerald ? 5 : 28, row.emerald ? 150 : 25, row.emerald ? 105 : 23);
    doc.text(row.value, pageWidth - margin, y, { align: 'right' });
    y += 7.5;
  });

  y += 6;

  // Section 3: Rincian Biaya Usaha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text('Rincian Biaya Operasional', margin, y);
  y += 6;

  if (report.expenseBreakdown.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 113, 108);
    doc.text('Belum ada pengeluaran biaya operasional tercatat pada periode ini.', margin, y);
    y += 7;
  } else {
    report.expenseBreakdown.forEach((item) => {
      if (y > 270) {
        doc.addPage();
        y = 18;
      }
      doc.setDrawColor(245, 245, 244);
      doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(68, 64, 60);
      doc.text(`${item.category} (${item.count}x)`, margin, y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(190, 18, 60);
      doc.text(formatRupiahPdf(item.totalAmount), pageWidth - margin, y, { align: 'right' });
      y += 7;
    });
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(168, 162, 158);
  doc.text(
    'Dokumen ini dibuat otomatis oleh KasirAkun UMKM sebagai ringkasan laporan usaha.',
    margin,
    286
  );

  return doc;
}

/**
 * Triggers instant PDF file download for the Tier-1 Simple Financial Report.
 */
export function downloadTier1ReportPdf(params: {
  tenantName: string;
  report: Tier1PeriodReport;
}): string {
  const doc = buildTier1ReportPdfDoc(params);
  const periodSlug = params.report.period.toLowerCase();
  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `Laporan-Keuangan-${periodSlug}-${slugifyFilePart(params.tenantName)}-${datePart}.pdf`;
  doc.save(fileName);
  return fileName;
}

/**
 * Builds and downloads a clean A4 PDF summary of monthly daily revenue trend for DashboardPage.
 */
export function downloadDashboardTrendPdf(params: {
  tenantName: string;
  monthLabel: string;
  points: DailyRevenuePoint[];
  totalRevenue: string;
  totalOrders: number;
}): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(28, 25, 23);
  doc.text(`Laporan Penjualan Harian - ${params.tenantName}`, margin, y);
  y += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(87, 83, 78);
  doc.text(
    `Periode: ${params.monthLabel}  |  Total Omzet: ${formatRupiahPdf(params.totalRevenue)}  |  Total Transaksi: ${params.totalOrders} nota`,
    margin,
    y
  );
  y += 5;

  doc.setDrawColor(231, 229, 228);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  const activeDays = params.points.filter((p) => Number(p.revenue) > 0 || p.orderCount > 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(87, 83, 78);
  doc.text('Tanggal', margin, y);
  doc.text('Jumlah Nota', margin + 65, y);
  doc.text('Total Penjualan', pageWidth - margin, y, { align: 'right' });
  y += 5;
  doc.line(margin, y - 2, pageWidth - margin, y - 2);

  if (activeDays.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.text('Belum ada transaksi penjualan pada bulan ini.', margin, y + 3);
  } else {
    activeDays.forEach((pt) => {
      if (y > 272) {
        doc.addPage();
        y = 18;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(28, 25, 23);
      doc.text(pt.label, margin, y);
      doc.text(`${pt.orderCount} nota`, margin + 65, y);
      doc.setFont('helvetica', 'bold');
      doc.text(formatRupiahPdf(pt.revenue), pageWidth - margin, y, { align: 'right' });
      y += 6.5;
    });
  }

  const fileName = `Laporan-Penjualan-${slugifyFilePart(params.tenantName)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
  return fileName;
}

export interface DailyClosingPdfInput {
  tenantName: string;
  dateLabel: string;
  orderCount: number;
  totalSales: string;
  cashSales: string;
  nonCashSales: string;
  cashExpenses: string;
  openingCash: string;
  expectedCashInDrawer: string;
  actualCashCounted: string;
  cashVariance: string;
  varianceStatus: 'MATCH' | 'SURPLUS' | 'SHORTAGE';
  lowStockCount: number;
  cashierName?: string;
}

/**
 * Builds an A4 PDF document for 1-click Daily Cashier Closing & Drawer Reconciliation
 * including physical handover signature blocks for Kasir & Pemilik Usaha.
 */
export function buildDailyClosingPdfDoc(
  params: DailyClosingPdfInput,
  generatedAt: Date = new Date()
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(28, 25, 23);
  doc.text(params.tenantName, margin, y);
  y += 6.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(5, 150, 105);
  doc.text(`Rekap Tutup Kasir Harian (${params.dateLabel})`, margin, y);
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(87, 83, 78);
  const printedLabel = generatedAt.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(
    `Dicetak: ${printedLabel}${params.cashierName ? `  |  Petugas: ${params.cashierName}` : ''}  |  ${params.orderCount} nota lunas`,
    margin,
    y
  );
  y += 4;

  doc.setDrawColor(231, 229, 228);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // 4-Box Summary
  const boxW = (contentWidth - 9) / 4;
  const boxH = 22;
  const summaryBoxes = [
    {
      label: 'Total Omzet',
      value: formatRupiahPdf(params.totalSales),
      sub: `${params.orderCount} transaksi`,
      accent: [28, 25, 23] as const,
    },
    {
      label: 'Penjualan Tunai',
      value: formatRupiahPdf(params.cashSales),
      sub: 'Masuk laci kasir',
      accent: [5, 150, 105] as const,
    },
    {
      label: 'Non-Tunai',
      value: formatRupiahPdf(params.nonCashSales),
      sub: 'QRIS / Transfer',
      accent: [28, 25, 23] as const,
    },
    {
      label: 'Biaya Keluar',
      value: formatRupiahPdf(params.cashExpenses),
      sub: 'Pengeluaran kas',
      accent: [190, 18, 60] as const,
    },
  ];

  summaryBoxes.forEach((kpi, idx) => {
    const x = margin + idx * (boxW + 3);
    doc.setFillColor(250, 250, 249);
    doc.setDrawColor(231, 229, 228);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 113, 108);
    doc.text(kpi.label, x + 3, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(kpi.accent[0], kpi.accent[1], kpi.accent[2]);
    doc.text(kpi.value, x + 3, y + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 113, 108);
    doc.text(kpi.sub, x + 3, y + 18.5);
  });
  y += boxH + 10;

  // Reconciliation Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text('Rekonsiliasi Uang Fisik Laci Kasir', margin, y);
  y += 7;

  const statusText =
    params.varianceStatus === 'MATCH'
      ? 'Cocok 100% dengan catatan sistem'
      : params.varianceStatus === 'SURPLUS'
      ? `Selisih Lebih (${formatRupiahPdf(params.cashVariance)})`
      : `Selisih Kurang (${formatRupiahPdf(params.cashVariance)})`;

  const rows: Array<{ label: string; value: string; bold?: boolean; emerald?: boolean; rose?: boolean }> = [
    { label: 'Modal Awal Laci Kasir', value: formatRupiahPdf(params.openingCash) },
    { label: 'Penjualan Tunai Hari Ini', value: `+${formatRupiahPdf(params.cashSales)}`, emerald: true },
    { label: 'Biaya Operasional Keluar (Tunai)', value: `-${formatRupiahPdf(params.cashExpenses)}`, rose: true },
    { label: 'Uang Seharusnya di Laci', value: formatRupiahPdf(params.expectedCashInDrawer), bold: true },
    { label: 'Uang Fisik Dihitung di Laci', value: formatRupiahPdf(params.actualCashCounted), bold: true },
    {
      label: 'Status Selisih Laci',
      value: statusText,
      bold: true,
      emerald: params.varianceStatus === 'MATCH',
      rose: params.varianceStatus === 'SHORTAGE',
    },
  ];

  rows.forEach((row) => {
    doc.setDrawColor(245, 245, 244);
    doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 10 : 9.5);
    doc.setTextColor(28, 25, 23);
    doc.text(row.label, margin, y);

    if (row.emerald) {
      doc.setTextColor(5, 150, 105);
    } else if (row.rose) {
      doc.setTextColor(190, 18, 60);
    } else {
      doc.setTextColor(28, 25, 23);
    }
    doc.text(row.value, pageWidth - margin, y, { align: 'right' });
    y += 8;
  });

  y += 6;

  // Low stock shopping reminder
  doc.setFillColor(250, 250, 249);
  doc.setDrawColor(231, 229, 228);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(28, 25, 23);
  doc.text('Catatan Stok untuk Belanja Esok Hari', margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(87, 83, 78);
  doc.text(
    params.lowStockCount > 0
      ? `Terdapat ${params.lowStockCount} barang yang stoknya menipis. Periksa menu Monitor Stok & Restok.`
      : 'Semua stok barang utama masih dalam batas aman.',
    margin + 4,
    y + 12
  );
  y += 30;

  // Handover Signature Blocks
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(87, 83, 78);
  doc.text('Diserahkan oleh (Kasir Bertugas),', margin + 10, y);
  doc.text('Diterima & Diperiksa oleh (Pemilik Usaha),', pageWidth - margin - 68, y);

  y += 22;
  doc.setDrawColor(168, 162, 158);
  doc.line(margin + 8, y, margin + 62, y);
  doc.line(pageWidth - margin - 68, y, pageWidth - margin - 10, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(28, 25, 23);
  doc.text(params.cashierName || 'Nama Kasir', margin + 10, y);
  doc.text('Pemilik Usaha', pageWidth - margin - 68, y);

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(168, 162, 158);
  doc.text(
    'Dokumen arsip rekap tutup kasir harian ini dibuat otomatis oleh KasirAkun UMKM.',
    margin,
    286
  );

  return doc;
}

export function downloadDailyClosingPdf(params: DailyClosingPdfInput): string {
  const doc = buildDailyClosingPdfDoc(params);
  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `Rekap-Tutup-Kasir-${slugifyFilePart(params.tenantName)}-${datePart}.pdf`;
  doc.save(fileName);
  return fileName;
}
