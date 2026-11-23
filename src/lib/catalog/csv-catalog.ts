/**
 * Pure, Zero-Dependency CSV Catalog Import & Export Utility (Excel-Indonesia Friendly)
 * - Supports both `,` and `;` delimiters (Indonesian Excel commonly exports `;`)
 * - Uses Decimal.js for monetary & stock fields (zero floating-point drift)
 * - Returns clear Indonesian validation summaries for layperson store owners
 */

import Decimal from 'decimal.js';
import type { Category, Product } from '../../types/domain.ts';

export interface CsvImportedProductDraft {
  name: string;
  sku: string;
  barcodeQr: string;
  categoryName: string;
  unit: string;
  sellingPrice: string;
  costPriceAvg: string;
  stockQty: string;
  minStockAlert: string;
  isTaxExempt: boolean;
}

export interface CsvImportParseResult {
  items: CsvImportedProductDraft[];
  errors: string[];
  delimiterDetected: ',' | ';';
}

const CSV_HEADERS = [
  'Nama Barang',
  'Kode / SKU',
  'Barcode',
  'Kategori',
  'Satuan',
  'Harga Jual',
  'Harga Modal',
  'Stok',
  'Stok Minimum',
  'Bebas PPN (YA/TIDAK)',
] as const;

function escapeCsvCell(value: string): string {
  const clean = String(value ?? '');
  if (clean.includes(',') || clean.includes(';') || clean.includes('"') || clean.includes('\n')) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

function parseNumericField(raw: string | undefined, fallback = '0'): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/rp\.?/gi, '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // Indonesian thousands separator e.g. 15.000
    .replace(/,/g, '.');
  if (!cleaned) return new Decimal(fallback).toFixed(4);
  try {
    const dec = new Decimal(cleaned);
    if (!dec.isFinite() || dec.isNegative()) return new Decimal(fallback).toFixed(4);
    return dec.toFixed(4);
  } catch {
    return new Decimal(fallback).toFixed(4);
  }
}

function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function detectCsvDelimiter(headerLine: string): ',' | ';' {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

export function buildCatalogCsvTemplate(): string {
  const sampleRows = [
    ['Beras Rojolele 5kg', 'BRS-001', '8991002100011', 'Bahan Pokok', 'karung', '78000', '68000', '20', '5', 'YA'],
    ['Minyak Goreng 2L', 'MYK-002', '8991002100028', 'Bahan Pokok', 'pouch', '38500', '33000', '25', '6', 'YA'],
    ['Teh Botol 350ml', 'MNM-003', '8991002100035', 'Minuman', 'botol', '5000', '3500', '48', '12', 'TIDAK'],
  ];
  const lines = [
    CSV_HEADERS.map(escapeCsvCell).join(','),
    ...sampleRows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function exportCatalogToCsv(products: Product[], categories: Category[]): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const sellable = products.filter((p) => p.itemType !== 'RAW_MATERIAL');
  const lines = [CSV_HEADERS.map(escapeCsvCell).join(',')];

  for (const p of sellable) {
    const row = [
      p.name,
      p.sku || '',
      p.barcodeQr || '',
      (p.categoryId && catMap.get(p.categoryId)) || 'Umum',
      p.unit || 'pcs',
      new Decimal(p.sellingPrice || '0').toDecimalPlaces(0).toString(),
      new Decimal(p.costPriceAvg || '0').toDecimalPlaces(0).toString(),
      new Decimal(p.stockQty || '0').toDecimalPlaces(2).toString(),
      new Decimal(p.minStockAlert || '5').toDecimalPlaces(0).toString(),
      p.isTaxExempt ? 'YA' : 'TIDAK',
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function parseCatalogCsv(csvText: string): CsvImportParseResult {
  const normalized = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length < 2) {
    return {
      items: [],
      errors: ['File CSV kosong atau hanya berisi judul kolom. Gunakan Template CSV sebagai panduan.'],
      delimiterDetected: ',',
    };
  }

  const delimiter = detectCsvDelimiter(rawLines[0]);
  const headers = splitCsvLine(rawLines[0], delimiter).map((h) => h.toLowerCase());

  const findCol = (keywords: string[], fallbackIndex: number): number => {
    const idx = headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));
    return idx >= 0 ? idx : fallbackIndex;
  };

  const nameIdx = findCol(['nama', 'name', 'produk', 'barang'], 0);
  const skuIdx = findCol(['sku', 'kode'], 1);
  const barcodeIdx = findCol(['barcode', 'qr'], 2);
  const catIdx = findCol(['kategori', 'category'], 3);
  const unitIdx = findCol(['satuan', 'unit'], 4);
  const priceIdx = findCol(['harga jual', 'jual', 'price'], 5);
  const costIdx = findCol(['harga modal', 'modal', 'hpp', 'cost'], 6);
  const stockIdx = findCol(['stok', 'stock'], 7);
  const minIdx = findCol(['minimum', 'min'], 8);
  const exemptIdx = findCol(['bebas ppn', 'exempt', 'sembako'], 9);

  const items: CsvImportedProductDraft[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rawLines.length; i += 1) {
    const cells = splitCsvLine(rawLines[i], delimiter);
    const name = (cells[nameIdx] || '').trim();
    if (!name) {
      errors.push(`Baris ${i + 1}: Nama barang kosong, dilewati.`);
      continue;
    }

    const sellingPrice = parseNumericField(cells[priceIdx], '0');
    if (new Decimal(sellingPrice).lte(0)) {
      errors.push(`Baris ${i + 1} (${name}): Harga jual tidak valid atau Rp0, dilewati.`);
      continue;
    }

    const rawExempt = (cells[exemptIdx] || '').trim().toLowerCase();
    const isTaxExempt = rawExempt === 'ya' || rawExempt === 'true' || rawExempt === '1' || rawExempt === 'yes';

    items.push({
      name: name.slice(0, 160),
      sku: (cells[skuIdx] || '').trim() || `SKU-${Date.now().toString().slice(-4)}-${i}`,
      barcodeQr: (cells[barcodeIdx] || '').trim(),
      categoryName: (cells[catIdx] || '').trim() || 'Umum',
      unit: (cells[unitIdx] || '').trim() || 'pcs',
      sellingPrice,
      costPriceAvg: parseNumericField(cells[costIdx], '0'),
      stockQty: parseNumericField(cells[stockIdx], '0'),
      minStockAlert: parseNumericField(cells[minIdx], '5'),
      isTaxExempt,
    });
  }

  return { items, errors, delimiterDetected: delimiter };
}
