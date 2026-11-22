import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTier1PeriodReport } from '../accounting/tier1-period-report';
import { buildTier1ReportPdfDoc } from './tier1-report-pdf';

test('buildTier1ReportPdfDoc outputs a valid %PDF- binary document for Tier-1 financial reports', () => {
  const report = computeTier1PeriodReport({
    orders: [],
    expenses: [],
    products: [],
    period: 'MONTHLY',
    referenceDate: new Date('2026-11-21T10:00:00.000Z'),
  });

  const doc = buildTier1ReportPdfDoc({
    tenantName: 'Warung Makmur Jaya',
    report,
    generatedAt: new Date('2026-11-21T10:00:00.000Z'),
  });

  const rawPdf = doc.output('datauristring');
  assert.ok(rawPdf.startsWith('data:application/pdf'));
  const arrayBuf = doc.output('arraybuffer');
  const header = new TextDecoder().decode(new Uint8Array(arrayBuf).slice(0, 5));
  assert.equal(header, '%PDF-');
  assert.ok(arrayBuf.byteLength > 1000);
});
