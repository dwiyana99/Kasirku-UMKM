import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
  DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES,
  DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
  evaluateIdleState,
  formatIdleTimeoutLabel,
  getDefaultIdleTimeoutForRole,
  normalizeIdleTimeoutMinutes,
  resolveEffectiveIdleTimeoutMinutes,
} from './session-timeout.ts';
import { buildMasterProvisionedAccountAndWorkspace } from './account-management.ts';
import { provisionOnboardedCustomer } from '../saas/onboarding-service.ts';

test('Default idle timeout policy: Master 30 menit, Customer & Staff Nonaktif (0)', () => {
  assert.equal(DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES, 30);
  assert.equal(DEFAULT_USER_IDLE_TIMEOUT_MINUTES, 0);
  assert.equal(DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES, 0);

  assert.equal(getDefaultIdleTimeoutForRole('MASTER_ADMIN'), 30);
  assert.equal(getDefaultIdleTimeoutForRole('CUSTOMER'), 0);
  assert.equal(getDefaultIdleTimeoutForRole('STAFF'), 0);
  assert.equal(getDefaultIdleTimeoutForRole('GUEST'), 0);
});

test('normalizeIdleTimeoutMinutes enforces 0 (disabled) or clamped [5..1440]', () => {
  assert.equal(normalizeIdleTimeoutMinutes(0, 30), 0);
  assert.equal(normalizeIdleTimeoutMinutes(-15, 30), 0);
  assert.equal(normalizeIdleTimeoutMinutes(1, 0), 5);
  assert.equal(normalizeIdleTimeoutMinutes(4, 0), 5);
  assert.equal(normalizeIdleTimeoutMinutes(30, 0), 30);
  assert.equal(normalizeIdleTimeoutMinutes('60', 0), 60);
  assert.equal(normalizeIdleTimeoutMinutes(5000, 0), 1440);
  assert.equal(normalizeIdleTimeoutMinutes(undefined, 30), 30);
  assert.equal(normalizeIdleTimeoutMinutes(null, 0), 0);
  assert.equal(normalizeIdleTimeoutMinutes('abc', 30), 30);
});

test('resolveEffectiveIdleTimeoutMinutes respects role defaults and custom per-account overrides', () => {
  assert.equal(resolveEffectiveIdleTimeoutMinutes({ role: 'MASTER_ADMIN' }), 30);
  assert.equal(
    resolveEffectiveIdleTimeoutMinutes({
      role: 'MASTER_ADMIN',
      masterIdleTimeoutMinutes: 60,
      sessionIdleTimeoutMinutes: 30,
    }),
    60,
  );
  assert.equal(
    resolveEffectiveIdleTimeoutMinutes({
      role: 'MASTER_ADMIN',
      masterIdleTimeoutMinutes: 0,
      sessionIdleTimeoutMinutes: 30,
    }),
    0,
  );

  assert.equal(resolveEffectiveIdleTimeoutMinutes({ role: 'CUSTOMER' }), 0);
  assert.equal(
    resolveEffectiveIdleTimeoutMinutes({
      role: 'CUSTOMER',
      customerIdleTimeoutMinutes: 45,
      sessionIdleTimeoutMinutes: 0,
    }),
    45,
  );

  assert.equal(resolveEffectiveIdleTimeoutMinutes({ role: 'STAFF' }), 0);
  assert.equal(
    resolveEffectiveIdleTimeoutMinutes({
      role: 'STAFF',
      staffIdleTimeoutMinutes: 15,
      sessionIdleTimeoutMinutes: 0,
    }),
    15,
  );

  assert.equal(
    resolveEffectiveIdleTimeoutMinutes({
      role: 'GUEST',
      sessionIdleTimeoutMinutes: 30,
    }),
    0,
  );
});

test('evaluateIdleState transitions cleanly through DISABLED -> ACTIVE -> WARNING -> EXPIRED', () => {
  const t0 = 1_750_000_000_000;

  const disabled = evaluateIdleState({
    nowMs: t0 + 999_999_999,
    lastActivityMs: t0,
    timeoutMinutes: 0,
  });
  assert.equal(disabled.phase, 'DISABLED');

  const active = evaluateIdleState({
    nowMs: t0 + 10 * 60 * 1000,
    lastActivityMs: t0,
    timeoutMinutes: 30,
  });
  assert.equal(active.phase, 'ACTIVE');
  assert.equal(active.remainingSeconds, 20 * 60);

  const warning = evaluateIdleState({
    nowMs: t0 + 29 * 60 * 1000 + 20 * 1000,
    lastActivityMs: t0,
    timeoutMinutes: 30,
  });
  assert.equal(warning.phase, 'WARNING');
  assert.equal(warning.remainingSeconds, 40);

  const expired = evaluateIdleState({
    nowMs: t0 + 30 * 60 * 1000,
    lastActivityMs: t0,
    timeoutMinutes: 30,
  });
  assert.equal(expired.phase, 'EXPIRED');
  assert.equal(expired.remainingSeconds, 0);
});

test('formatIdleTimeoutLabel formats human-readable Indonesian labels', () => {
  assert.equal(formatIdleTimeoutLabel(0), 'Nonaktif');
  assert.equal(formatIdleTimeoutLabel(undefined), 'Nonaktif');
  assert.equal(formatIdleTimeoutLabel(30), '30 menit');
  assert.equal(formatIdleTimeoutLabel(60), '1 jam');
  assert.equal(formatIdleTimeoutLabel(90), '1 jam 30 mnt');
});

test('Clean-slate Simulation onboarding starts 100% empty with Rp 0 capital, Rp 0 MRR, and Auto-Logout Nonaktif', () => {
  const { customer, workspace } = provisionOnboardedCustomer({
    invoice: {
      id: 'inv-sim-1',
      invoiceNumber: 'SIM-202611-0001',
      customerEmail: 'sim.clean@usaha.id',
      selectedModules: ['POS_BASIC'],
      planCode: 'PRO',
      selectedAddOns: [],
      billingCycle: 'MONTHLY',
      subtotalAmount: '0.0000',
      dppNilaiLain: '0.0000',
      ppnAmount: '0.0000',
      grandTotal: '0.0000',
      paymentMethod: 'QRIS_DYNAMIC',
      paymentStatus: 'VERIFIED_PAID',
      gatewayRefId: 'SIM-REF-0001',
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    accountScope: 'SIMULATION',
    fullName: 'Penguji Simulasi',
    email: 'sim.clean@usaha.id',
    username: 'sim_clean',
    phone: '081299990000',
    passwordDemo: 'SimUser2026!',
    businessName: 'Kedai Simulasi Bersih',
    vertical: 'KEDAI_MAKAN',
    taxEntity: 'WP_OP',
    isPkp: false,
    npwp16: '',
    nitku22: '',
    address: 'Jl. Simulasi No. 1',
    receiptFooter: 'Terima kasih',
    thermalPaperWidth: '58mm',
    autoPrintQrOrders: false,
    tableCount: 0,
    initialCapital: '0',
    menuDrafts: [],
    customFields: [],
  });

  assert.equal(customer.accountScope, 'SIMULATION');
  assert.equal(customer.isDemoAccount, false);
  assert.equal(customer.monthlyRecurringRevenue, '0.0000');
  assert.equal(customer.idleTimeoutMinutes, 0);
  assert.equal(workspace.tenant.accountScope, 'SIMULATION');
  assert.equal(workspace.products.length, 0);
  assert.equal(workspace.orders.length, 0);
  assert.equal(workspace.expenses.length, 0);
  assert.equal((workspace.crmCustomers ?? []).length, 0);
  assert.equal(workspace.journalEntries.length, 0);
  assert.ok(workspace.accounts.length >= 5);
});

test('Master-provisioned SIMULATION ignores templateWorkspace and guarantees 100% clean slate', () => {
  const populated = provisionOnboardedCustomer({
    invoice: {
      id: 'inv-tpl-1',
      invoiceNumber: 'INV-TPL-0001',
      customerEmail: 'template@usaha.id',
      selectedModules: ['POS_BASIC'],
      planCode: 'PRO',
      selectedAddOns: [],
      billingCycle: 'MONTHLY',
      subtotalAmount: '249000.0000',
      dppNilaiLain: '228250.0000',
      ppnAmount: '27390.0000',
      grandTotal: '276390.0000',
      paymentMethod: 'QRIS_DYNAMIC',
      paymentStatus: 'VERIFIED_PAID',
      gatewayRefId: 'GW-TPL-0001',
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    fullName: 'Template Owner',
    email: 'template@usaha.id',
    phone: '081200000001',
    passwordDemo: 'TemplateUser2026!',
    businessName: 'Template Resto',
    vertical: 'RESTORAN',
    taxEntity: 'WP_OP',
    isPkp: false,
    npwp16: '',
    nitku22: '',
    address: 'Jl. Template No. 2',
    receiptFooter: 'Terima kasih',
    thermalPaperWidth: '80mm',
    autoPrintQrOrders: false,
    tableCount: 4,
    initialCapital: '15000000',
    menuDrafts: [
      {
        name: 'Kopi Susu',
        description: 'Kopi susu gula aren',
        categoryName: 'Minuman',
        sellingPrice: '25000',
        costPriceAvg: '9000',
        stockQty: '10',
        unit: 'Cup',
      },
    ],
    customFields: [],
  });
  assert.ok(populated.workspace.products.length > 0, 'Template workspace should have sample products');
  assert.ok(populated.workspace.journalEntries.length > 0, 'Template workspace should have opening journal');

  const { customer, workspace } = buildMasterProvisionedAccountAndWorkspace({
    accountScope: 'SIMULATION',
    fullName: 'Simulasi Tanpa Dummy',
    email: 'sim.nodummy@usaha.id',
    username: 'sim_nodummy',
    password: 'SimUser2026!',
    passwordHash: 'hash-placeholder',
    businessName: 'Resto Uji Kosong',
    vertical: 'RESTORAN',
    taxEntity: 'WP_OP',
    planCode: 'EXPERT',
    billingCycle: 'MONTHLY',
    templateWorkspace: populated.workspace,
  });

  assert.equal(customer.accountScope, 'SIMULATION');
  assert.equal(customer.idleTimeoutMinutes, 0);
  assert.equal(customer.monthlyRecurringRevenue, '0.0000');
  assert.equal(workspace.products.length, 0);
  assert.equal(workspace.orders.length, 0);
  assert.equal(workspace.expenses.length, 0);
  assert.equal(workspace.journalEntries.length, 0);
});
