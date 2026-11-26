/**
 * KasirAkun UMKM — Real Client-Side PDF Generator (jsPDF)
 * Generates genuine downloadable .pdf files for Purchase Orders (PO) and Stock Transfer Surat Jalan.
 * Works 100% inside sandboxed iframes, mobile browsers, and desktop without relying on window.print() / window.open().
 * Strictly Decimal.js for all monetary calculations.
 */

import Decimal from 'decimal.js';
import { jsPDF } from 'jspdf';
import { formatRupiah } from '../pos/checkout-service.ts';
import type { PurchaseOrder, StockTransfer, Tenant } from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

function safeFilePart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'dokumen';
}

function drawHorizontalRule(doc: jsPDF, y: number, color: [number, number, number] = [226, 232, 240]) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.35);
  doc.line(14, y, 196, y);
}

/**
 * Builds a jsPDF instance for a Purchase Order (PO) document.
 * Separated from downloadPurchaseOrderPdf so it can be unit-tested cleanly in Node.
 */
export function buildPurchaseOrderPdfDocument(params: {
  po: PurchaseOrder;
  tenant: Pick<Tenant, 'name' | 'address' | 'npwp16'>;
  branchName?: string;
}): jsPDF {
  const { po, tenant, branchName } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const orderDateLabel = po.orderDate || po.createdAt.slice(0, 10);

  // Top Header Band
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(14, 14, 182, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PURCHASE ORDER (PO)', 20, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(tenant.name.toUpperCase(), 20, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(po.poNumber, 190, 23, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Tanggal: ${orderDateLabel}  |  Status: ${po.status}`, 190, 30, { align: 'right' });

  // Company & Supplier Info
  doc.setTextColor(15, 23, 42);
  let y = 44;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PEMESAN / PERUSAHAAN:', 14, y);
  doc.text('KEPADA SUPPLIER:', 110, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const buyerLines = doc.splitTextToSize(
    [
      tenant.name,
      tenant.address || '-',
      branchName ? `Tujuan Pengiriman: ${branchName}` : null,
      tenant.npwp16 ? `NPWP: ${tenant.npwp16}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    88
  );
  const supplierLines = doc.splitTextToSize(
    [
      po.supplierName,
      po.supplierPhone ? `Telp/WA: ${po.supplierPhone}` : null,
      po.expectedDeliveryDate ? `Target Kirim: ${po.expectedDeliveryDate}` : null,
      po.dueDate ? `Jatuh Tempo: ${po.dueDate}` : null,
      po.paymentType
        ? `Termin Bayar: ${po.paymentType === 'TEMPO_HUTANG' ? 'Tempo Hutang Supplier' : 'Tunai / Lunas'}`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
    84
  );

  doc.text(buyerLines, 14, y);
  doc.text(supplierLines, 110, y);
  y += Math.max(buyerLines.length, supplierLines.length) * 4.6 + 6;

  drawHorizontalRule(doc, y);
  y += 7;

  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 4.5, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('No', 17, y + 0.5);
  doc.text('Nama Barang / SKU', 26, y + 0.5);
  doc.text('Qty', 114, y + 0.5, { align: 'right' });
  doc.text('Satuan', 120, y + 0.5);
  doc.text('Harga Satuan', 160, y + 0.5, { align: 'right' });
  doc.text('Subtotal', 193, y + 0.5, { align: 'right' });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  let computedSubtotal = new Decimal(0);

  po.items.forEach((item, index) => {
    if (y > 245) {
      doc.addPage();
      y = 20;
    }
    const qtyDec = new Decimal(item.orderedQty || '0');
    const unitDec = new Decimal(item.unitCostEstimate ?? item.unitCost ?? '0');
    const lineSub = item.lineTotal ? new Decimal(item.lineTotal) : qtyDec.times(unitDec);
    computedSubtotal = computedSubtotal.plus(lineSub);

    const itemName = item.productNameSnapshot ?? item.productName ?? item.productId;
    const itemSku = item.skuSnapshot ?? item.sku ?? '';
    const itemUnit = item.unitSnapshot ?? item.unit ?? 'pcs';

    const nameLines = doc.splitTextToSize(itemSku ? `${itemName} (${itemSku})` : itemName, 78);
    doc.setFontSize(8.5);
    doc.text(String(index + 1), 17, y);
    doc.text(nameLines, 26, y);
    doc.text(qtyDec.toDecimalPlaces(2).toString(), 114, y, { align: 'right' });
    doc.text(itemUnit, 120, y);
    doc.text(formatRupiah(unitDec), 160, y, { align: 'right' });
    doc.text(formatRupiah(lineSub), 193, y, { align: 'right' });

    const rowHeight = Math.max(6.5, nameLines.length * 4.4 + 2);
    y += rowHeight;
    drawHorizontalRule(doc, y - 2, [241, 245, 249]);
  });

  // Totals Box
  y += 4;
  const subtotalDisplay = po.totalEstimatedCost
    ? new Decimal(po.totalEstimatedCost)
    : computedSubtotal;
  const landedShipping = new Decimal(po.landedCostShipping || '0');
  const grandTotalDisplay = subtotalDisplay.plus(landedShipping);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal Barang:', 152, y, { align: 'right' });
  doc.text(formatRupiah(subtotalDisplay), 193, y, { align: 'right' });

  if (landedShipping.gt(0)) {
    y += 5.5;
    doc.text('Ongkir / Landed Cost:', 152, y, { align: 'right' });
    doc.text(formatRupiah(landedShipping), 193, y, { align: 'right' });
  }

  y += 7;
  doc.setFillColor(236, 253, 245);
  doc.rect(118, y - 5, 78, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 95, 70);
  doc.text('TOTAL PO:', 152, y + 0.8, { align: 'right' });
  doc.text(formatRupiah(grandTotalDisplay), 193, y + 0.8, { align: 'right' });

  // Notes
  doc.setTextColor(51, 65, 85);
  y += 14;
  if (po.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Catatan:', 14, y);
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(po.notes, 180);
    doc.text(noteLines, 14, y + 4.5);
    y += noteLines.length * 4.4 + 8;
  }

  // Signature Footer
  const sigY = Math.max(y + 10, 242);
  drawHorizontalRule(doc, sigY - 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Disetujui oleh (Pemesan),', 38, sigY, { align: 'center' });
  doc.text('Diterima oleh (Supplier),', 162, sigY, { align: 'center' });

  doc.text('( _________________________ )', 38, sigY + 20, { align: 'center' });
  doc.text('( _________________________ )', 162, sigY + 20, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Dokumen digenerate otomatis oleh KasirAkun UMKM · ${new Date().toLocaleString('id-ID')}`,
    105,
    287,
    { align: 'center' }
  );

  return doc;
}

export function downloadPurchaseOrderPdf(params: {
  po: PurchaseOrder;
  tenant: Pick<Tenant, 'name' | 'address' | 'npwp16'>;
  branchName?: string;
}): string {
  const doc = buildPurchaseOrderPdfDocument(params);
  const filename = `${safeFilePart(params.po.poNumber)}.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * Generates and downloads a real PDF Surat Jalan for a 3-stage Stock Transfer.
 */
export function buildStockTransferPdfDocument(params: {
  transfer: StockTransfer;
  tenant: Pick<Tenant, 'name' | 'address'>;
  sourceBranchName: string;
  destBranchName: string;
}): jsPDF {
  const { transfer, tenant, sourceBranchName, destBranchName } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(15, 23, 42);
  doc.rect(14, 14, 182, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('SURAT JALAN TRANSFER STOK', 20, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(tenant.name.toUpperCase(), 20, 29);
  doc.setFont('helvetica', 'bold');
  doc.text(transfer.transferNumber, 190, 23, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Status: ${transfer.status}`, 190, 29, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  let y = 44;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Asal Pengiriman:', 14, y);
  doc.text('Tujuan Penerimaan:', 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sourceBranchName, 14, y + 5);
  doc.text(destBranchName, 110, y + 5);

  y += 14;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 4.5, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('No', 17, y + 0.5);
  doc.text('Nama Barang', 26, y + 0.5);
  doc.text('Qty Kirim', 132, y + 0.5, { align: 'right' });
  doc.text('HPP Satuan', 162, y + 0.5, { align: 'right' });
  doc.text('Nilai (1108)', 193, y + 0.5, { align: 'right' });

  y += 8;
  doc.setFont('helvetica', 'normal');
  let totalVal = new Decimal(0);

  transfer.items.forEach((item, idx) => {
    const qty = new Decimal(item.shippedQty || item.requestedQty || '0');
    const unitCost = new Decimal(item.unitCostSnapshot ?? item.unitCostAtShip ?? '0');
    const lineVal = qty.times(unitCost);
    totalVal = totalVal.plus(lineVal);
    const nameLabel = item.productNameSnapshot || item.productName || item.productId;
    const unitLabel = item.unitSnapshot ?? item.unit ?? 'pcs';

    doc.text(String(idx + 1), 17, y);
    doc.text(nameLabel, 26, y);
    doc.text(`${qty.toDecimalPlaces(2).toString()} ${unitLabel}`, 132, y, { align: 'right' });
    doc.text(formatRupiah(unitCost), 162, y, { align: 'right' });
    doc.text(formatRupiah(lineVal), 193, y, { align: 'right' });
    y += 7;
    drawHorizontalRule(doc, y - 2, [241, 245, 249]);
  });

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Total Nilai Persediaan Dalam Perjalanan (1108):', 155, y, { align: 'right' });
  doc.text(formatRupiah(totalVal), 193, y, { align: 'right' });

  const sigY = Math.max(y + 24, 240);
  doc.setFont('helvetica', 'normal');
  doc.text('Pengirim (Gudang Asal)', 40, sigY, { align: 'center' });
  doc.text('Kurir / Ekspedisi', 105, sigY, { align: 'center' });
  doc.text('Penerima (Cabang Tujuan)', 168, sigY, { align: 'center' });
  doc.text('( _________________ )', 40, sigY + 18, { align: 'center' });
  doc.text('( _________________ )', 105, sigY + 18, { align: 'center' });
  doc.text('( _________________ )', 168, sigY + 18, { align: 'center' });

  return doc;
}

export function downloadStockTransferPdf(params: {
  transfer: StockTransfer;
  tenant: Pick<Tenant, 'name' | 'address'>;
  sourceBranchName: string;
  destBranchName: string;
}): string {
  const doc = buildStockTransferPdfDocument(params);
  const filename = `SuratJalan-${safeFilePart(params.transfer.transferNumber)}.pdf`;
  doc.save(filename);
  return filename;
}
