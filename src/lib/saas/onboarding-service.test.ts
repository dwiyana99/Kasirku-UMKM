import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  applyMasterCustomerUpdate,
  calculatePlatformMrrSummary,
  calculateSubscriptionPricing,
  deactivateCustomerAccount,
  provisionOnboardedCustomer,
  reactivateCustomerAccount,
} from './onboarding-service';
import {
  calculateBomUnitCost,
  calculateRestockMovingAverage,
  canAccessModule,
  createInventoryPurchaseJournalEntry,
  getRequiredModuleForRoute,
} from './subscription-lifecycle';
import { generateThreeTierFinancialReport, validateBalancedJournal } from '../accounting/journal-engine';
import type { Product, ProductRecipe, SubscriptionInvoice } from '../../types/domain';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../../prisma/seed';

test('Subscription Pricing: calculates monthly & annual 15% discount with PMK 131/2024 PPN 12% x 11/12', () => {
  const monthly = calculateSubscriptionPricing(
    ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL'],
    'MONTHLY'
  );
  // 0 + 79,000 + 99,000 = 178,000
  assert.equal(monthly.subtotal, '178000.0000');
  // DPP Nilai Lain = round(178,000 * 11 / 12) = 163,167
  assert.equal(monthly.dppNilaiLain, '163167.0000');
  // PPN = round(163,167 * 0.12) = 19,580
  assert.equal(monthly.ppnAmount, '19580.0000');
  assert.equal(monthly.grandTotal, '197580.0000');

  const annual = calculateSubscriptionPricing(
    ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL'],
    'ANNUAL'
  );
  // 178,000 * 12 = 2,136,000; 15% discount = 320,400; subtotal = 1,815,600
  assert.equal(annual.discountAmount, '320400.0000');
  assert.equal(annual.subtotal, '1815600.0000');
  assert.equal(annual.effectiveMonthlyMrr, '151300.0000');
});

test('Onboarding Guard: rejects account creation if subscription payment is not VERIFIED_PAID', () => {
  const unpaidInvoice: SubscriptionInvoice = {
    id: 'inv-1',
    invoiceNumber: 'SUB-2026-0001',
    customerEmail: 'owner@kopisenja.id',
    billingCycle: 'MONTHLY',
    selectedModules: ['POS_BASIC', 'QR_TABLE_KITCHEN'],
    subtotalAmount: '79000.0000',
    dppNilaiLain: '72417.0000',
    ppnAmount: '8690.0000',
    grandTotal: '87690.0000',
    paymentMethod: 'QRIS_DYNAMIC',
    paymentStatus: 'PENDING_PAYMENT',
    gatewayRefId: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  };

  assert.throws(() => {
    provisionOnboardedCustomer({
      invoice: unpaidInvoice,
      fullName: 'Rina Kusuma',
      email: 'owner@kopisenja.id',
      passwordDemo: 'Demo2026!',
      phone: '081234567890',
      businessName: 'Kedai Kopi Senja',
      vertical: 'KEDAI_MAKAN',
      taxEntity: 'WP_OP',
      isPkp: false,
      npwp16: '3174081205920001',
      nitku22: '3174081205920001000001',
      address: 'Jl. Panglima Polim, Jakarta',
      receiptFooter: 'Terima kasih!',
      thermalPaperWidth: '80mm',
      autoPrintQrOrders: true,
      tableCount: 5,
      initialCapital: '20000000',
      menuDrafts: [
        {
          name: 'Matcha Latte',
          description: 'Matcha Jepang dengan susu segar',
          categoryName: 'Minuman',
          sellingPrice: '34000',
          costPriceAvg: '11000',
          stockQty: '50',
          unit: 'gelas',
        },
      ],
      customFields: [],
    });
  }, /belum terverifikasi lunas/i);
});

test('Onboarding Provisioning & Master Admin Per-User Settings: creates balanced ledger & recalculates MRR', () => {
  const paidInvoice: SubscriptionInvoice = {
    id: 'inv-2',
    invoiceNumber: 'SUB-2026-0002',
    customerEmail: 'rina@kopisenja.id',
    billingCycle: 'MONTHLY',
    selectedModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL'],
    subtotalAmount: '178000.0000',
    dppNilaiLain: '163167.0000',
    ppnAmount: '19580.0000',
    grandTotal: '197580.0000',
    paymentMethod: 'QRIS_DYNAMIC',
    paymentStatus: 'VERIFIED_PAID',
    gatewayRefId: 'QRIS-SUB-9999',
    paidAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const { customer, workspace } = provisionOnboardedCustomer({
    invoice: paidInvoice,
    fullName: 'Rina Kusuma',
    email: 'rina@kopisenja.id',
    passwordDemo: 'Demo2026!',
    phone: '081234567890',
    businessName: 'Kedai Kopi Senja',
    vertical: 'KEDAI_MAKAN',
    taxEntity: 'WP_OP',
    isPkp: false,
    npwp16: '3174081205920001',
    nitku22: '3174081205920001000001',
    address: 'Jl. Panglima Polim, Jakarta',
    receiptFooter: 'Terima kasih!',
    thermalPaperWidth: '80mm',
    autoPrintQrOrders: true,
    tableCount: 6,
    initialCapital: '25000000',
    menuDrafts: [
      {
        name: 'Matcha Latte Premium',
        description: 'Matcha Uji ceremonial + susu segar',
        categoryName: 'Minuman Signature',
        sellingPrice: '34000',
        costPriceAvg: '11500',
        stockQty: '0',
        unit: 'gelas',
      },
    ],
    customFields: [
      {
        targetEntity: 'orders',
        fieldKey: 'level_gula',
        fieldLabel: 'Level Gula',
        fieldType: 'SELECT',
        options: ['Normal', 'Less Sugar', 'No Sugar'],
        isRequired: false,
      },
    ],
  });

  assert.equal(workspace.accounts.length, DEFAULT_CHART_OF_ACCOUNTS.length);
  assert.equal(workspace.tables.length, 6);
  assert.equal(workspace.products.length, 1);
  assert.equal(workspace.products[0].name, 'Matcha Latte Premium');
  assert.equal(customer.monthlyRecurringRevenue, '178000.0000');

  // Verify opening balance sheet equation Aset === Liabilitas + Ekuitas
  const report = generateThreeTierFinancialReport(
    workspace.accounts,
    workspace.journalEntries,
    workspace.orders,
    workspace.expenses,
    workspace.fixedAssets
  );
  assert.equal(report.tier2.isEquationBalanced, true);
  assert.equal(new Decimal(report.tier2.totalAssets).toFixed(0), '25000000');

  // Master updates customer modules (adds TAX_CORETAX +49,000, tries to omit POS_BASIC -> POS_BASIC stays locked)
  const updated = applyMasterCustomerUpdate(customer, {
    activeModules: ['QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    maxTenantsAllowed: 5,
    status: 'ACTIVE',
  });
  assert.ok(updated.activeModules.includes('POS_BASIC'));
  assert.equal(updated.monthlyRecurringRevenue, '227000.0000');

  const summary = calculatePlatformMrrSummary([updated]);
  assert.equal(summary.totalMrr, '227000.0000');
  assert.equal(summary.activeCount, 1);

  // Deactivate customer account & associated subscription -> MRR drops to 0, paid modules revoked
  const deactivated = deactivateCustomerAccount(updated, 'Permintaan berhenti langganan');
  assert.equal(deactivated.status, 'DEACTIVATED');
  assert.deepEqual(deactivated.activeModules, ['POS_BASIC']);
  assert.equal(deactivated.monthlyRecurringRevenue, '0.0000');
  const summaryAfterDeact = calculatePlatformMrrSummary([deactivated]);
  assert.equal(summaryAfterDeact.totalMrr, '0.0000');
  assert.equal(summaryAfterDeact.deactivatedCount, 1);

  // Reactivate account restoring modules
  const reactivated = reactivateCustomerAccount(deactivated, ['POS_BASIC', 'QR_TABLE_KITCHEN']);
  assert.equal(reactivated.status, 'ACTIVE');
  assert.equal(reactivated.monthlyRecurringRevenue, '79000.0000');
});

test('Empty-Store Onboarding: new store starts with 0 products & balanced opening ledger', () => {
  const paidInvoice: SubscriptionInvoice = {
    id: 'inv-empty-1',
    invoiceNumber: 'SUB-2026-0099',
    customerEmail: 'toko.baru@umkm.id',
    billingCycle: 'MONTHLY',
    selectedModules: ['POS_BASIC', 'ACCOUNTING_FULL'],
    subtotalAmount: '99000.0000',
    dppNilaiLain: '90750.0000',
    ppnAmount: '10890.0000',
    grandTotal: '109890.0000',
    paymentMethod: 'QRIS_DYNAMIC',
    paymentStatus: 'VERIFIED_PAID',
    gatewayRefId: 'QRIS-SUB-EMPTY-1',
    paidAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const { customer, workspace } = provisionOnboardedCustomer({
    invoice: paidInvoice,
    fullName: 'Budi Santoso',
    email: 'toko.baru@umkm.id',
    passwordDemo: 'TokoBaru2026!',
    phone: '081300001111',
    businessName: 'Toko Sembako Baru',
    vertical: 'WARUNG_SEMBAKO',
    taxEntity: 'WP_OP',
    isPkp: false,
    npwp16: '3174081205920009',
    nitku22: '3174081205920009000001',
    address: 'Jl. Merdeka No. 1, Bandung',
    receiptFooter: 'Terima kasih!',
    thermalPaperWidth: '80mm',
    autoPrintQrOrders: false,
    tableCount: 0,
    initialCapital: '15000000',
    menuDrafts: [],
    customFields: [],
  });

  assert.equal(workspace.products.length, 0);
  assert.equal(workspace.orders.length, 0);
  assert.ok(workspace.categories.length >= 1);
  assert.equal(workspace.accounts.length, DEFAULT_CHART_OF_ACCOUNTS.length);
  assert.equal(customer.accountScope, 'REAL');

  const report = generateThreeTierFinancialReport(
    workspace.accounts,
    workspace.journalEntries,
    workspace.orders,
    workspace.expenses,
    workspace.fixedAssets
  );
  assert.equal(report.tier2.isEquationBalanced, true);
  assert.equal(new Decimal(report.tier2.totalAssets).toFixed(0), '15000000');
});

test('Module Access Gating: gates routes strictly by active modules and account status', () => {
  assert.equal(getRequiredModuleForRoute('/kitchen'), 'QR_TABLE_KITCHEN');
  assert.equal(getRequiredModuleForRoute('/tables'), 'QR_TABLE_KITCHEN');
  assert.equal(getRequiredModuleForRoute('/accounting'), 'ACCOUNTING_FULL');
  assert.equal(getRequiredModuleForRoute('/expenses'), 'ACCOUNTING_FULL');
  assert.equal(getRequiredModuleForRoute('/tax'), 'TAX_CORETAX');
  assert.equal(getRequiredModuleForRoute('/pos'), null);

  assert.equal(canAccessModule(['POS_BASIC'], 'POS_BASIC', 'ACTIVE'), true);
  assert.equal(canAccessModule(['POS_BASIC'], 'QR_TABLE_KITCHEN', 'ACTIVE'), false);
  assert.equal(canAccessModule(['POS_BASIC', 'QR_TABLE_KITCHEN'], 'QR_TABLE_KITCHEN', 'ACTIVE'), true);
  assert.equal(canAccessModule(['POS_BASIC', 'QR_TABLE_KITCHEN'], 'QR_TABLE_KITCHEN', 'DEACTIVATED'), false);
  assert.equal(canAccessModule(['POS_BASIC', 'ACCOUNTING_FULL'], 'ACCOUNTING_FULL', 'SUSPENDED'), false);
});

test('BOM Recipe HPP & Moving Average Restock with Balanced Inventory Purchase Journal', () => {
  // Moving Average: 10 kg @ 48,000 + 10 kg @ 52,000 = 20 kg @ 50,000, purchase value = 520,000
  const restock = calculateRestockMovingAverage({
    currentQty: '10',
    currentAvgCost: '48000',
    addedQty: '10',
    purchaseUnitCost: '52000',
  });
  assert.equal(new Decimal(restock.newQty).toFixed(0), '20');
  assert.equal(new Decimal(restock.newAvgCost).toFixed(0), '50000');
  assert.equal(new Decimal(restock.totalPurchaseValue).toFixed(0), '520000');

  const accounts = DEFAULT_CHART_OF_ACCOUNTS.map((a, idx) => ({
    id: `acc-${idx + 1}`,
    tenantId: 't-1',
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
    isSystemLocked: a.isSystemLocked,
  }));
  const invJe = createInventoryPurchaseJournalEntry({
    tenantId: 't-1',
    productName: 'Ayam Fillet',
    addedQty: '10',
    unit: 'kg',
    totalPurchaseValue: restock.totalPurchaseValue,
    paymentAccountCode: '1101',
    accounts,
    entrySeq: 5,
  });
  const check = validateBalancedJournal(
    invJe.lines.map((l) => ({
      accountCode: l.accountCodeSnapshot,
      debit: l.debit,
      credit: l.credit,
    }))
  );
  assert.equal(check.valid, true);
  assert.equal(invJe.lines.find((l) => l.accountCodeSnapshot === '1105')?.debit, '520000.0000');
  assert.equal(invJe.lines.find((l) => l.accountCodeSnapshot === '1101')?.credit, '520000.0000');

  // BOM Unit Cost: 0.25 kg Ayam (@50,000 = 12,500) + 0.1 kg Bumbu (@40,000 = 4,000) = 16,500
  const products: Product[] = [
    {
      id: 'raw-1',
      tenantId: 't-1',
      categoryId: null,
      sku: 'RAW-1',
      barcodeQr: '',
      name: 'Ayam Fillet',
      description: '',
      itemType: 'RAW_MATERIAL',
      unit: 'kg',
      sellingPrice: '0',
      costPriceAvg: '50000',
      stockQty: '5', // 5 / 0.25 = 20 portions
      minStockAlert: '1',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: false,
      customAttributes: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: 'raw-2',
      tenantId: 't-1',
      categoryId: null,
      sku: 'RAW-2',
      barcodeQr: '',
      name: 'Bumbu Kacang',
      description: '',
      itemType: 'RAW_MATERIAL',
      unit: 'kg',
      sellingPrice: '0',
      costPriceAvg: '40000',
      stockQty: '1', // 1 / 0.1 = 10 portions (bottleneck!)
      minStockAlert: '0.5',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: false,
      customAttributes: {},
      createdAt: new Date().toISOString(),
    },
  ];
  const recipes: ProductRecipe[] = [
    { id: 'r1', tenantId: 't-1', menuProductId: 'menu-1', ingredientProductId: 'raw-1', quantityRequired: '0.25' },
    { id: 'r2', tenantId: 't-1', menuProductId: 'menu-1', ingredientProductId: 'raw-2', quantityRequired: '0.10' },
  ];
  const bom = calculateBomUnitCost('menu-1', recipes, products);
  assert.equal(new Decimal(bom.unitCost).toFixed(0), '16500');
  assert.equal(bom.maxCraftablePortions, 10);
});
