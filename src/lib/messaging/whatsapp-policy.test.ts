import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomerReceiptWaMessage,
  buildOwnerRecapWaUrl,
  evaluateWhatsappSendingPolicy,
  formatPaymentMethodIndonesian,
  isCashierKioskFocusSession,
} from './whatsapp-policy';
import { buildDailyClosingPdfDoc } from '../pdf/tier1-report-pdf';

describe('WhatsApp Sending Policy & Cashier Kiosk Focus Engine', () => {
  it('hides all WhatsApp send buttons and enables dashboard reminder when owner WA is missing', () => {
    const noWaLite = evaluateWhatsappSendingPolicy({
      businessWhatsappNumber: '',
      hasFonnte: false,
    });
    assert.equal(noWaLite.hasOwnerWa, false);
    assert.equal(noWaLite.canShowSendButtons, false);
    assert.equal(noWaLite.canSendOwnerRecap, false);
    assert.equal(noWaLite.canSendCustomerMessage, false);
    assert.equal(noWaLite.needsOwnerWaReminder, true);
    assert.equal(noWaLite.channel, 'HIDDEN');

    const invalidShortWa = evaluateWhatsappSendingPolicy({
      businessWhatsappNumber: '0812',
      hasFonnte: true,
    });
    assert.equal(invalidShortWa.hasOwnerWa, false);
    assert.equal(invalidShortWa.canShowSendButtons, false);
    assert.equal(invalidShortWa.needsOwnerWaReminder, true);
  });

  it('activates WA_ME_DIRECT mode when owner WA is set and Fonnte add-on is not active', () => {
    const directState = evaluateWhatsappSendingPolicy({
      businessWhatsappNumber: '0812-3456-7890',
      hasFonnte: false,
    });
    assert.equal(directState.hasOwnerWa, true);
    assert.equal(directState.ownerWaDigits, '6281234567890');
    assert.equal(directState.canShowSendButtons, true);
    assert.equal(directState.canSendOwnerRecap, true);
    assert.equal(directState.canSendCustomerMessage, true);
    assert.equal(directState.needsOwnerWaReminder, false);
    assert.equal(directState.channel, 'WA_ME_DIRECT');
  });

  it('activates FONNTE mode when owner WA is set and Fonnte add-on is active', () => {
    const fonnteState = evaluateWhatsappSendingPolicy({
      businessWhatsappNumber: '6281199887766',
      hasFonnte: true,
    });
    assert.equal(fonnteState.channel, 'FONNTE');
    assert.equal(fonnteState.canShowSendButtons, true);
    assert.equal(fonnteState.needsOwnerWaReminder, false);
  });

  it('builds owner recap wa.me URL only when owner WA is configured', () => {
    const missing = buildOwnerRecapWaUrl({
      businessWhatsappNumber: '',
      message: 'Rekap Harian',
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.url, null);

    const valid = buildOwnerRecapWaUrl({
      businessWhatsappNumber: '081234567890',
      message: 'Rekap Harian Warung',
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.ownerDigits, '6281234567890');
    assert.ok(valid.url?.startsWith('https://wa.me/6281234567890?text='));
  });

  it('formats customer WhatsApp receipts with natural Indonesian payment method labels', () => {
    assert.equal(formatPaymentMethodIndonesian('CASH'), 'Tunai');
    assert.equal(formatPaymentMethodIndonesian('QRIS_DYNAMIC'), 'QRIS');
    assert.equal(formatPaymentMethodIndonesian('BANK_TRANSFER'), 'Transfer Bank');

    const text = buildCustomerReceiptWaMessage({
      tenant: { name: 'Warung Makmur', address: 'Jl. Melati No. 5', receiptFooter: 'Terima kasih.' },
      order: {
        id: 'ord-1',
        tenantId: 't-1',
        branchId: 'b-1',
        orderNumber: 'ORD-001',
        orderSource: 'POS_CASHIER',
        tableId: null,
        customerName: 'Ibu Sari',
        subtotal: '15000',
        discountAmount: '0',
        serviceCharge: '0',
        taxType: 'NONE',
        dppNilaiLain: '0',
        taxAmount: '0',
        grandTotal: '15000',
        totalCogs: '12000',
        paymentStatus: 'PAID',
        kitchenStatus: 'SERVED',
        isReceiptPrinted: false,
        customAttributes: {},
        createdAt: new Date().toISOString(),
        items: [
          {
            id: 'it-1',
            orderId: 'ord-1',
            productId: 'p-1',
            itemNameSnapshot: 'Beras 1kg',
            qty: '1',
            unitPrice: '15000',
            unitCogs: '12000',
          },
        ],
        payment: {
          id: 'pay-1',
          tenantId: 't-1',
          orderId: 'ord-1',
          paymentMethod: 'CASH',
          amountPaid: '15000',
          mdrFee: '0',
          gatewayRefId: null,
          paidAt: new Date().toISOString(),
        },
      },
    });
    assert.ok(text.includes('Metode: Tunai (Lunas)'));
    assert.ok(!text.includes('CASH'));
  });

  it('generates valid A4 PDF binary for Daily Cashier Closing reconciliation', () => {
    const doc = buildDailyClosingPdfDoc({
      tenantName: 'Warung Makmur Jaya',
      dateLabel: '23 Nov 2026',
      orderCount: 12,
      totalSales: '450000',
      cashSales: '350000',
      nonCashSales: '100000',
      cashExpenses: '50000',
      openingCash: '200000',
      expectedCashInDrawer: '500000',
      actualCashCounted: '500000',
      cashVariance: '0',
      varianceStatus: 'MATCH',
      lowStockCount: 2,
      cashierName: 'Ibu Susi',
    });
    const buf = Buffer.from(doc.output('arraybuffer'));
    assert.ok(buf.byteLength > 1000);
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  it('detects Cashier Kiosk Focus Mode strictly for cashier-only staff on /pos', () => {
    assert.equal(
      isCashierKioskFocusSession(
        { role: 'STAFF', staffPermissions: ['POS_CASHIER'] },
        '/pos'
      ),
      true
    );
    assert.equal(
      isCashierKioskFocusSession(
        { role: 'STAFF', staffPermissions: ['POS_CASHIER'] },
        '/dashboard'
      ),
      false
    );
    assert.equal(
      isCashierKioskFocusSession(
        { role: 'STAFF', staffPermissions: ['POS_CASHIER', 'CATALOG_MANAGE'] },
        '/pos'
      ),
      false
    );
    assert.equal(
      isCashierKioskFocusSession({ role: 'CUSTOMER' }, '/pos'),
      false
    );
  });
});
