/**
 * Shelf Price Tag & Barcode Label PDF Generator (A4 Grid)
 * Specifically tailored for Warung Sembako & Toko Retail using jsPDF (0 AI Token).
 */

import { jsPDF } from 'jspdf';
import Decimal from 'decimal.js';
import type { Category, Product } from '../../types/domain.ts';

function formatRpLabel(value: string): string {
  const num = new Decimal(value || '0').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const formatted = num.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${formatted}`;
}

function drawSimpleBarcode(
  doc: jsPDF,
  code: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const safeCode = (code || '000000').toUpperCase();
  const totalBars = 36;
  const barUnit = width / (totalBars * 1.45);
  let cursor = x;

  doc.setFillColor(28, 25, 23);
  for (let i = 0; i < totalBars; i++) {
    const ch = safeCode.charCodeAt(i % safeCode.length);
    const isThick = (ch + i * 7) % 3 === 0;
    const drawBar = (ch + i * 3) % 2 === 0 || i < 2 || i >= totalBars - 2;
    const barW = isThick ? barUnit * 1.4 : barUnit * 0.85;
    if (drawBar && cursor + barW <= x + width) {
      doc.rect(cursor, y, barW, height, 'F');
    }
    cursor += barUnit * 1.45;
  }
}

export function downloadShelfLabelsPdf(params: {
  tenantName: string;
  products: Product[];
  categories?: Category[];
}): string | null {
  const { tenantName, products, categories = [] } = params;
  const activeProducts = products.filter(
    (p) => p.isAvailable && p.itemType !== 'RAW_MATERIAL'
  );
  if (activeProducts.length === 0) return null;

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginX = 12;
  const marginY = 14;
  const cols = 3;
  const rowsPerPage = 7;
  const gapX = 4;
  const gapY = 4;
  const cardW = (pageWidth - marginX * 2 - gapX * (cols - 1)) / cols;
  const cardH = 34;

  const renderPageHeader = (pageNum: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(87, 83, 78);
    doc.text(`${tenantName}  |  Label Harga Rak & Barcode`, marginX, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Hal ${pageNum}`, pageWidth - marginX, 9, { align: 'right' });
  };

  let pageNum = 1;
  renderPageHeader(pageNum);

  activeProducts.forEach((product, idx) => {
    const posInPage = idx % (cols * rowsPerPage);
    if (idx > 0 && posInPage === 0) {
      doc.addPage();
      pageNum += 1;
      renderPageHeader(pageNum);
    }

    const col = posInPage % cols;
    const row = Math.floor(posInPage / cols);
    const x = marginX + col * (cardW + gapX);
    const y = marginY + row * (cardH + gapY);

    doc.setDrawColor(214, 211, 209);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'S');

    doc.setFillColor(5, 150, 105);
    doc.rect(x, y, cardW, 2.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(28, 25, 23);
    const titleLines = doc.splitTextToSize(product.name, cardW - 6).slice(0, 2);
    doc.text(titleLines, x + 3, y + 7);

    const catLabel = (product.categoryId && catMap.get(product.categoryId)) || 'Produk';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(120, 113, 108);
    doc.text(`${catLabel} / ${product.unit}`, x + 3, y + 14.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(5, 150, 105);
    doc.text(formatRpLabel(product.sellingPrice), x + 3, y + 22);

    const codeStr = product.barcodeQr || product.sku;
    drawSimpleBarcode(doc, codeStr, x + 3, y + 24.2, cardW - 6, 5.2);
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(87, 83, 78);
    doc.text(codeStr, x + cardW / 2, y + 32.2, { align: 'center' });
  });

  const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28) || 'toko';
  const filename = `label-harga-rak-${slug}.pdf`;
  doc.save(filename);
  return filename;
}
