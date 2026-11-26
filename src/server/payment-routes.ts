/**
 * Express Routes for Payment Gateway (Midtrans, Simulator, Manual),
 * Real-Time Customer Facing Display, Universal Webhook + Double-Entry Ledger Posting,
 * H+1 Settlement Reconciliation, Payment Setup Assistance Queue, and Master Admin Custom WA Templates.
 */

import path from 'node:path';
import type express from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  assertTenantAccess,
  type PartitionedTenantDatabase,
  type SignedSessionPayload,
} from '../lib/db/tenant-db.ts';
import { encryptSecret, decryptSecret, maskSecretKey } from '../lib/payments/crypto.ts';
import {
  DEFAULT_ENABLED_CHANNELS,
  DEFAULT_PAYMENT_CONFIG_RATES,
  buildGatewayPaymentJournalLines,
  buildSettlementBatchJournalLines,
  computePaymentBreakdown,
} from '../lib/payments/fee-calculator.ts';
import {
  DEFAULT_WA_MESSAGE_TEMPLATES,
} from '../lib/payments/wa-templates.ts';
import {
  getPaymentAdapter,
  signSimulatorWebhook,
  type DecryptedGatewayCredentials,
} from '../lib/payments/adapters/index.ts';
import type {
  Account,
  CustomerDisplaySnapshot,
  JournalEntry,
  PaymentGatewayProvider,
  PaymentSetupAssistanceRequest,
  PaymentTransaction,
  SettlementBatch,
  TenantPaymentConfig,
  WaMessageTemplate,
} from '../types/domain.ts';

export interface PaymentRoutesDeps {
  tenantDb: PartitionedTenantDatabase;
  extractSessionFromRequest: (req: express.Request) => SignedSessionPayload | null;
  DATA_ROOT: string;
  loadJsonFile: <T>(filePath: string, fallback: T) => T;
  saveJsonFile: (filePath: string, data: unknown) => void;
  liveTickets: Map<
    string,
    {
      id: string;
      tenantId: string;
      tenantSlug: string;
      orderNumber: string;
      tableNumber: string;
      customerName: string;
      grandTotal: string;
      mdrFee: string;
      paymentStatus: 'PENDING_QRIS' | 'PAID';
      kitchenStatus: 'PENDING' | 'COOKING' | 'READY' | 'SERVED';
      items: Array<{ name: string; qty: number; unitPrice: string; notes?: string }>;
      autoPrintTriggered: boolean;
      gatewayRefId: string;
      createdAt: string;
      paidAt: string | null;
    }
  >;
}

const PROVIDERS_ENUM = ['SIMULATOR', 'MIDTRANS', 'MANUAL_ONLY'] as const;

function sanitizePaymentConfigForClient(
  config: TenantPaymentConfig,
  originBase: string
): Omit<TenantPaymentConfig, 'encryptedServerKey' | 'encryptedClientKey' | 'encryptedPrivateKey'> & {
  webhookUrls: Record<'MIDTRANS', string>;
} {
  const {
    encryptedServerKey: _es,
    encryptedClientKey: _ec,
    encryptedPrivateKey: _ep,
    ...safeRest
  } = config;
  return {
    ...safeRest,
    hasServerKey: Boolean(config.encryptedServerKey),
    hasClientKey: Boolean(config.encryptedClientKey),
    hasPrivateKey: Boolean(config.encryptedPrivateKey),
    webhookUrls: {
      MIDTRANS: `${originBase}/api/webhooks/payment/midtrans/${config.tenantId}`,
    },
  };
}

function createDefaultPaymentConfig(tenantId: string): TenantPaymentConfig {
  return {
    id: `paycfg-${tenantId}`,
    tenantId,
    provider: 'SIMULATOR',
    environment: 'SANDBOX',
    merchantCode: null,
    encryptedServerKey: null,
    encryptedClientKey: null,
    encryptedPrivateKey: null,
    maskedServerKey: null,
    maskedClientKey: null,
    maskedPrivateKey: null,
    hasServerKey: false,
    hasClientKey: false,
    hasPrivateKey: false,
    feeBearer: 'CUSTOMER',
    qrisMdrPercent: DEFAULT_PAYMENT_CONFIG_RATES.qrisMdrPercent,
    vaFlatFee: DEFAULT_PAYMENT_CONFIG_RATES.vaFlatFee,
    ewalletFeePercent: DEFAULT_PAYMENT_CONFIG_RATES.ewalletFeePercent,
    enabledChannels: { ...DEFAULT_ENABLED_CHANNELS },
    manualBankAccounts: [
      {
        id: `bank-default-${tenantId}`,
        bankName: 'BCA',
        accountNumber: '8820123456',
        accountHolder: 'Pemilik Usaha UMKM',
        isActive: true,
      },
    ],
    setupStatus: 'SIMULATOR_MODE',
    lastTestedAt: null,
    configuredByAdminId: null,
    updatedAt: new Date().toISOString(),
  };
}

function decryptConfigCredentials(config: TenantPaymentConfig): DecryptedGatewayCredentials {
  let serverKey = '';
  let clientKey = '';
  let privateKey = '';
  try {
    if (config.encryptedServerKey) serverKey = decryptSecret(config.encryptedServerKey);
  } catch {
    serverKey = '';
  }
  try {
    if (config.encryptedClientKey) clientKey = decryptSecret(config.encryptedClientKey);
  } catch {
    clientKey = '';
  }
  try {
    if (config.encryptedPrivateKey) privateKey = decryptSecret(config.encryptedPrivateKey);
  } catch {
    privateKey = '';
  }
  return {
    environment: config.environment,
    merchantCode: config.merchantCode ?? null,
    serverKey: serverKey || null,
    clientKey: clientKey || null,
    privateKey: privateKey || null,
  };
}

function ensureSystemAccount(
  accounts: Account[],
  tenantId: string,
  code: string,
  name: string,
  category: Account['category'],
  normalBalance: Account['normalBalance']
): Account {
  const existing = accounts.find((a) => a.code === code);
  if (existing) return existing;
  const created: Account = {
    id: `acc-${tenantId}-${code}`,
    tenantId,
    code,
    name,
    category,
    normalBalance,
    isSystemLocked: true,
  };
  accounts.push(created);
  return created;
}

export function mountPaymentAndWaRoutes(app: express.Express, deps: PaymentRoutesDeps): void {
  const { tenantDb, extractSessionFromRequest, DATA_ROOT, loadJsonFile, saveJsonFile, liveTickets } = deps;

  const PAYMENT_CONFIGS_PATH = path.join(DATA_ROOT, '_payment_configs.json');
  const PAYMENT_TXNS_PATH = path.join(DATA_ROOT, '_payment_txns.json');
  const PAYMENT_ASSIST_PATH = path.join(DATA_ROOT, '_payment_assist.json');
  const SETTLEMENT_BATCHES_PATH = path.join(DATA_ROOT, '_settlement_batches.json');
  const WA_TEMPLATES_PATH = path.join(DATA_ROOT, '_wa_templates.json');

  let paymentConfigs: TenantPaymentConfig[] = loadJsonFile<TenantPaymentConfig[]>(
    PAYMENT_CONFIGS_PATH,
    []
  );
  let paymentTransactions: PaymentTransaction[] = loadJsonFile<PaymentTransaction[]>(
    PAYMENT_TXNS_PATH,
    []
  );
  let paymentAssistRequests: PaymentSetupAssistanceRequest[] = loadJsonFile<
    PaymentSetupAssistanceRequest[]
  >(PAYMENT_ASSIST_PATH, []);
  let settlementBatches: SettlementBatch[] = loadJsonFile<SettlementBatch[]>(
    SETTLEMENT_BATCHES_PATH,
    []
  );
  let waTemplates: WaMessageTemplate[] = loadJsonFile<WaMessageTemplate[]>(
    WA_TEMPLATES_PATH,
    DEFAULT_WA_MESSAGE_TEMPLATES
  );
  if (waTemplates.length === 0) {
    waTemplates = [...DEFAULT_WA_MESSAGE_TEMPLATES];
    saveJsonFile(WA_TEMPLATES_PATH, waTemplates);
  }

  // Real-time Customer Facing Display snapshots keyed by branchId
  const customerDisplayByBranch = new Map<string, CustomerDisplaySnapshot>();

  function getOrCreatePaymentConfig(tenantId: string): TenantPaymentConfig {
    let cfg = paymentConfigs.find((c) => c.tenantId === tenantId);
    if (!cfg) {
      cfg = createDefaultPaymentConfig(tenantId);
      paymentConfigs.push(cfg);
      saveJsonFile(PAYMENT_CONFIGS_PATH, paymentConfigs);
    }
    return cfg;
  }

  function upsertPaymentConfig(updated: TenantPaymentConfig): TenantPaymentConfig {
    const idx = paymentConfigs.findIndex((c) => c.tenantId === updated.tenantId);
    if (idx >= 0) {
      paymentConfigs[idx] = updated;
    } else {
      paymentConfigs.push(updated);
    }
    saveJsonFile(PAYMENT_CONFIGS_PATH, paymentConfigs);
    return updated;
  }

  function getOriginBase(req: express.Request): string {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000');
    return `${proto}://${host}`;
  }

  /**
   * Atomic Settlement Handler invoked by Universal Webhook, Simulator, and Manual Verification.
   * Updates PaymentTransaction -> PAID, Order/BoardingInvoice -> PAID, KDS ticket -> QUEUED,
   * posts balanced Double-Entry Journal (including 2109 Titipan Biaya Admin PG anti-tax-inflation),
   * and updates live Customer Facing Display state -> PAID.
   */
  function applyPaidPaymentSettlement(
    txn: PaymentTransaction,
    rawWebhookPayload: Record<string, unknown> | null
  ): {
    transaction: PaymentTransaction;
    journalEntryId: string | null;
    idempotentReplay: boolean;
  } {
    if (txn.status === 'PAID' || txn.status === 'SETTLED') {
      return { transaction: txn, journalEntryId: null, idempotentReplay: true };
    }

    const paidAt = new Date().toISOString();
    txn.status = 'PAID';
    txn.paidAt = paidAt;
    txn.rawWebhookPayload = rawWebhookPayload;
    paymentTransactions = paymentTransactions.map((t) => (t.id === txn.id ? txn : t));
    saveJsonFile(PAYMENT_TXNS_PATH, paymentTransactions);

    let createdJournalId: string | null = null;
    const cfg = getOrCreatePaymentConfig(txn.tenantId);
    const wsRecord = tenantDb.findWorkspaceByTenantId(txn.tenantId);

    if (wsRecord) {
      const ws = structuredClone(wsRecord.workspace);
      const matchedOrder = txn.orderId
        ? ws.orders.find((o) => o.id === txn.orderId)
        : ws.orders.find((o) => o.orderNumber === txn.orderNumber);

      let subtotal = txn.baseAmount;
      let taxAmount = '0.0000';
      let taxAccountCode = '2103';
      let taxAccountName = 'Utang Pajak Daerah PB1 10%';
      let totalCogs = '0.0000';

      if (matchedOrder) {
        matchedOrder.paymentStatus = 'PAID';
        if (ws.tenant.vertical === 'RESTORAN' || ws.tenant.vertical === 'KEDAI_MAKAN') {
          matchedOrder.kitchenStatus = 'PENDING';
        }
        matchedOrder.payment = {
          id: `pay-${txn.id}`,
          tenantId: txn.tenantId,
          orderId: matchedOrder.id,
          paymentMethod:
            txn.paymentCategory === 'QRIS_DYNAMIC'
              ? 'QRIS_DYNAMIC'
              : txn.paymentCategory === 'VIRTUAL_ACCOUNT'
                ? 'VIRTUAL_ACCOUNT'
                : txn.channelCode === 'GOPAY'
                  ? 'EWALLET_GOPAY'
                  : txn.channelCode === 'DANA'
                    ? 'EWALLET_DANA'
                    : txn.channelCode === 'OVO'
                      ? 'EWALLET_OVO'
                      : txn.channelCode === 'SHOPEEPAY'
                        ? 'EWALLET_SHOPEEPAY'
                        : 'BANK_TRANSFER',
          amountPaid: txn.totalPayable,
          mdrFee: txn.gatewayMdrFee,
          gatewayRefId: txn.gatewayRefId ?? txn.id,
          paidAt,
        };
        subtotal = new Decimal(matchedOrder.subtotal || txn.baseAmount)
          .minus(new Decimal(matchedOrder.discountAmount || 0))
          .plus(new Decimal(matchedOrder.serviceCharge || 0))
          .toFixed(4);
        taxAmount = matchedOrder.taxAmount || '0.0000';
        taxAccountCode = matchedOrder.taxType === 'PPN_11_12' ? '2102' : '2103';
        taxAccountName =
          matchedOrder.taxType === 'PPN_11_12'
            ? 'Utang PPN Keluaran'
            : 'Utang Pajak Daerah PB1 10%';
        totalCogs = matchedOrder.totalCogs || '0.0000';
      }

      // Boarding Invoice settlement if linked
      if (txn.boardingInvoiceId && Array.isArray(ws.boardingInvoices)) {
        const inv = ws.boardingInvoices.find((b) => b.id === txn.boardingInvoiceId);
        if (inv) {
          inv.paymentStatus = 'PAID';
          inv.paidAt = paidAt;
        }
      }

      // Ensure required accounts exist (1103 Piutang PG, 2109 Titipan Biaya Admin PG, 6105 Beban MDR)
      const acc1101 = ensureSystemAccount(ws.accounts, txn.tenantId, '1101', 'Kas Tunai Operasional', 'ASSET', 'DEBIT');
      const acc1102 = ensureSystemAccount(ws.accounts, txn.tenantId, '1102', 'Bank Utama UMKM', 'ASSET', 'DEBIT');
      const acc1103 = ensureSystemAccount(ws.accounts, txn.tenantId, '1103', 'Piutang Settlement Payment Gateway', 'ASSET', 'DEBIT');
      const acc1401 = ensureSystemAccount(ws.accounts, txn.tenantId, '1401', 'Persediaan Barang / Bahan Baku', 'ASSET', 'DEBIT');
      const acc2102 = ensureSystemAccount(ws.accounts, txn.tenantId, '2102', 'Utang PPN Keluaran', 'LIABILITY', 'CREDIT');
      const acc2103 = ensureSystemAccount(ws.accounts, txn.tenantId, '2103', 'Utang Pajak Daerah PB1 10%', 'LIABILITY', 'CREDIT');
      const acc2109 = ensureSystemAccount(ws.accounts, txn.tenantId, '2109', 'Titipan Biaya Admin Payment Gateway', 'LIABILITY', 'CREDIT');
      const acc4101 = ensureSystemAccount(ws.accounts, txn.tenantId, '4101', 'Pendapatan Penjualan / Jasa', 'REVENUE', 'CREDIT');
      const acc5101 = ensureSystemAccount(ws.accounts, txn.tenantId, '5101', 'Harga Pokok Penjualan (HPP)', 'EXPENSE', 'DEBIT');
      const acc6105 = ensureSystemAccount(ws.accounts, txn.tenantId, '6105', 'Beban MDR / Biaya Admin Payment Gateway', 'EXPENSE', 'DEBIT');

      const accountByCode = new Map<string, Account>([
        ['1101', acc1101],
        ['1102', acc1102],
        ['1103', acc1103],
        ['1401', acc1401],
        ['2102', acc2102],
        ['2103', acc2103],
        ['2109', acc2109],
        ['4101', acc4101],
        ['5101', acc5101],
        ['6105', acc6105],
      ]);

      // Avoid duplicating journal entry for the same payment transaction
      const alreadyJournaled = ws.journalEntries.some((j) => j.sourceId === txn.id);
      if (!alreadyJournaled) {
        const journalDraft = buildGatewayPaymentJournalLines({
          orderNumber: txn.orderNumber || txn.id,
          subtotal,
          taxAmount,
          taxAccountCode,
          taxAccountName,
          uniqueCode: txn.uniqueCode ?? 0,
          customerAdminFee: txn.customerAdminFee,
          gatewayMdrFee: txn.gatewayMdrFee,
          totalPayable: txn.totalPayable,
          feeBearer: cfg.feeBearer,
          paymentCategory: txn.paymentCategory,
          totalCogs,
        });

        if (journalDraft.isBalanced && journalDraft.lines.length >= 2) {
          createdJournalId = `je-pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
          const newEntry: JournalEntry = {
            id: createdJournalId,
            tenantId: txn.tenantId,
            branchId: txn.branchId ?? null,
            entryNumber: `JRN-PG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(
              ws.journalEntries.length + 1
            ).padStart(4, '0')}`,
            entryDate: paidAt.slice(0, 10),
            sourceModule: txn.checkoutMode === 'MOBILE_SELF_ORDER' ? 'QR_ORDER' : 'POS',
            sourceId: txn.id,
            description: `Pelunasan Otomatis ${txn.provider} (${txn.channelCode}) — ${txn.orderNumber || txn.id}`,
            status: 'POSTED',
            reversedEntryId: null,
            lines: journalDraft.lines.map((l, idx) => {
              const acc = accountByCode.get(l.accountCode);
              return {
                id: `${createdJournalId}-ln-${idx + 1}`,
                journalEntryId: createdJournalId!,
                accountId: acc?.id ?? `acc-${txn.tenantId}-${l.accountCode}`,
                accountCodeSnapshot: l.accountCode,
                accountNameSnapshot: acc?.name ?? l.accountName,
                debit: l.debit,
                credit: l.credit,
                memo: l.memo,
              };
            }),
            createdAt: paidAt,
          };
          ws.journalEntries = [newEntry, ...ws.journalEntries];
        }
      }

      tenantDb.saveWorkspace(wsRecord.scope, wsRecord.ownerAccountId, ws);

      // Push live KDS ticket for mobile self-order / F&B
      if (txn.orderId) {
        const existingTicket = liveTickets.get(txn.orderId);
        if (existingTicket) {
          existingTicket.paymentStatus = 'PAID';
          existingTicket.paidAt = paidAt;
          existingTicket.mdrFee = txn.gatewayMdrFee;
          existingTicket.autoPrintTriggered = true;
          liveTickets.set(txn.orderId, existingTicket);
        } else if (txn.checkoutMode === 'MOBILE_SELF_ORDER') {
          liveTickets.set(txn.orderId, {
            id: txn.orderId,
            tenantId: txn.tenantId,
            tenantSlug: ws.tenant.slug,
            orderNumber: txn.orderNumber || txn.orderId,
            tableNumber: txn.tableNumber || 'MEJA',
            customerName: txn.customerName || 'Tamu Self-Order',
            grandTotal: txn.totalPayable,
            mdrFee: txn.gatewayMdrFee,
            paymentStatus: 'PAID',
            kitchenStatus: 'PENDING',
            items: (matchedOrder?.items || []).map((i) => ({
              name: i.itemNameSnapshot,
              qty: Number(i.qty),
              unitPrice: i.unitPrice,
              notes: i.notes,
            })),
            autoPrintTriggered: true,
            gatewayRefId: txn.gatewayRefId || txn.id,
            createdAt: txn.createdAt,
            paidAt,
          });
        }
      }
    }

    // Update live Customer Facing Display state -> PAID
    const displayKey = txn.branchId || txn.tenantId;
    const prevSnapshot = customerDisplayByBranch.get(displayKey);
    if (prevSnapshot && prevSnapshot.transaction?.id === txn.id) {
      customerDisplayByBranch.set(displayKey, {
        ...prevSnapshot,
        state: 'PAID',
        transaction: txn,
        updatedAt: paidAt,
      });
    }

    return {
      transaction: txn,
      journalEntryId: createdJournalId,
      idempotentReplay: false,
    };
  }

  // =========================================================================
  // 1. TENANT PAYMENT CONFIG (GET / PUT / TEST)
  // =========================================================================

  app.get('/api/payments/config', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    }
    const tenantId = String(req.query.tenantId || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'Parameter tenantId wajib diisi.' });
    }
    const rec = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec) {
      return res.status(404).json({ error: 'Workspace usaha tidak ditemukan.' });
    }
    if (!assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak untuk tenant ini.' });
    }
    const cfg = getOrCreatePaymentConfig(tenantId);
    return res.status(200).json({
      config: sanitizePaymentConfigForClient(cfg, getOriginBase(req)),
    });
  });

  // Public read-only checkout capabilities for /order/:slug/:qrToken
  app.get('/api/public/tenant/:slug/payment-options', (req, res) => {
    const slug = String(req.params.slug || '');
    const ws = tenantDb.findWorkspaceBySlug(slug);
    if (!ws) {
      return res.status(404).json({ error: 'Usaha tidak ditemukan.' });
    }
    const cfg = getOrCreatePaymentConfig(ws.tenant.id);
    return res.status(200).json({
      tenantId: ws.tenant.id,
      tenantName: ws.tenant.name,
      provider: cfg.provider,
      feeBearer: cfg.feeBearer,
      qrisMdrPercent: cfg.qrisMdrPercent,
      vaFlatFee: cfg.vaFlatFee,
      ewalletFeePercent: cfg.ewalletFeePercent,
      enabledChannels: cfg.enabledChannels,
      manualBankAccounts: cfg.manualBankAccounts.filter((b) => b.isActive),
    });
  });

  const updatePaymentConfigSchema = z.object({
    tenantId: z.string().min(1),
    provider: z.enum(PROVIDERS_ENUM),
    environment: z.enum(['SANDBOX', 'PRODUCTION']).default('SANDBOX'),
    merchantCode: z.string().max(120).optional().nullable(),
    serverKey: z.string().max(300).optional(),
    clientKey: z.string().max(300).optional(),
    privateKey: z.string().max(300).optional(),
    feeBearer: z.enum(['MERCHANT', 'CUSTOMER']).default('CUSTOMER'),
    qrisMdrPercent: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    vaFlatFee: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    ewalletFeePercent: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    enabledChannels: z.record(z.string(), z.boolean()).optional(),
    manualBankAccounts: z
      .array(
        z.object({
          id: z.string().min(1),
          bankName: z.string().min(2).max(60),
          accountNumber: z.string().min(4).max(40),
          accountHolder: z.string().min(2).max(120),
          isActive: z.boolean().default(true),
        })
      )
      .optional(),
  });

  app.put('/api/payments/config', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    }
    const parsed = updatePaymentConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Konfigurasi pembayaran tidak valid.',
        details: parsed.error.flatten(),
      });
    }
    const d = parsed.data;
    const rec = tenantDb.findWorkspaceByTenantId(d.tenantId);
    if (!rec) {
      return res.status(404).json({ error: 'Workspace usaha tidak ditemukan.' });
    }
    if (!assertTenantAccess(session, d.tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak untuk mengubah pengaturan tenant ini.' });
    }

    const existing = getOrCreatePaymentConfig(d.tenantId);
    const nextServerEnc = d.serverKey?.trim()
      ? encryptSecret(d.serverKey)
      : existing.encryptedServerKey ?? null;
    const nextServerMask = d.serverKey?.trim()
      ? maskSecretKey(d.serverKey)
      : existing.maskedServerKey ?? null;

    const nextClientEnc = d.clientKey?.trim()
      ? encryptSecret(d.clientKey)
      : existing.encryptedClientKey ?? null;
    const nextClientMask = d.clientKey?.trim()
      ? maskSecretKey(d.clientKey)
      : existing.maskedClientKey ?? null;

    const nextPrivateEnc = d.privateKey?.trim()
      ? encryptSecret(d.privateKey)
      : existing.encryptedPrivateKey ?? null;
    const nextPrivateMask = d.privateKey?.trim()
      ? maskSecretKey(d.privateKey)
      : existing.maskedPrivateKey ?? null;

    const nextStatus =
      d.provider === 'SIMULATOR'
        ? 'SIMULATOR_MODE'
        : d.provider === 'MANUAL_ONLY'
          ? 'MANUAL_ONLY'
          : nextServerEnc
            ? 'ACTIVE'
            : existing.setupStatus;

    const updated: TenantPaymentConfig = {
      ...existing,
      provider: d.provider,
      environment: d.environment,
      merchantCode: d.merchantCode !== undefined ? d.merchantCode : existing.merchantCode,
      encryptedServerKey: nextServerEnc,
      encryptedClientKey: nextClientEnc,
      encryptedPrivateKey: nextPrivateEnc,
      maskedServerKey: nextServerMask,
      maskedClientKey: nextClientMask,
      maskedPrivateKey: nextPrivateMask,
      feeBearer: d.feeBearer,
      qrisMdrPercent: d.qrisMdrPercent
        ? new Decimal(d.qrisMdrPercent).toFixed(4)
        : existing.qrisMdrPercent,
      vaFlatFee: d.vaFlatFee ? new Decimal(d.vaFlatFee).toFixed(4) : existing.vaFlatFee,
      ewalletFeePercent: d.ewalletFeePercent
        ? new Decimal(d.ewalletFeePercent).toFixed(4)
        : existing.ewalletFeePercent,
      enabledChannels: d.enabledChannels
        ? { ...existing.enabledChannels, ...d.enabledChannels }
        : existing.enabledChannels,
      manualBankAccounts: d.manualBankAccounts ?? existing.manualBankAccounts,
      setupStatus: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    upsertPaymentConfig(updated);
    return res.status(200).json({
      saved: true,
      config: sanitizePaymentConfigForClient(updated, getOriginBase(req)),
    });
  });

  app.post('/api/payments/config/test', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    }
    const tenantId = String(req.body?.tenantId || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId wajib diisi.' });
    }
    const rec = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec || !assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const cfg = getOrCreatePaymentConfig(tenantId);
    const decrypted = decryptConfigCredentials(cfg);
    // Allow testing freshly typed credentials before saving too
    const testCreds: DecryptedGatewayCredentials = {
      environment: (req.body?.environment || decrypted.environment) as 'SANDBOX' | 'PRODUCTION',
      merchantCode: req.body?.merchantCode || decrypted.merchantCode,
      serverKey: req.body?.serverKey || decrypted.serverKey,
      clientKey: req.body?.clientKey || decrypted.clientKey,
      privateKey: req.body?.privateKey || decrypted.privateKey,
    };
    const testProvider = (req.body?.provider || cfg.provider) as PaymentGatewayProvider;
    const adapter = getPaymentAdapter(testProvider);
    const result = await adapter.testConnection(testCreds);

    const updated: TenantPaymentConfig = {
      ...cfg,
      lastTestedAt: new Date().toISOString(),
      setupStatus: result.ok
        ? testProvider === 'SIMULATOR'
          ? 'SIMULATOR_MODE'
          : testProvider === 'MANUAL_ONLY'
            ? 'MANUAL_ONLY'
            : 'ACTIVE'
        : cfg.setupStatus,
      updatedAt: new Date().toISOString(),
    };
    upsertPaymentConfig(updated);

    return res.status(result.ok ? 200 : 422).json({
      ...result,
      config: sanitizePaymentConfigForClient(updated, getOriginBase(req)),
    });
  });

  // =========================================================================
  // 2. CREATE PAYMENT CHARGE (MODE 1 COUNTER SCREEN & MODE 2 MOBILE SELF-ORDER)
  // =========================================================================

  const createPaymentSchema = z.object({
    tenantId: z.string().min(1),
    branchId: z.string().optional().nullable(),
    branchName: z.string().optional(),
    orderId: z.string().optional().nullable(),
    boardingInvoiceId: z.string().optional().nullable(),
    orderNumber: z.string().min(2).max(80),
    customerName: z.string().min(1).max(120).default('Pelanggan Umum'),
    customerEmail: z.string().email().optional(),
    customerPhone: z.string().max(30).optional(),
    tableNumber: z.string().max(30).optional(),
    checkoutMode: z.enum(['COUNTER_SCREEN', 'MOBILE_SELF_ORDER']).default('COUNTER_SCREEN'),
    paymentCategory: z.enum([
      'QRIS_DYNAMIC',
      'EWALLET_DIRECT',
      'VIRTUAL_ACCOUNT',
      'MANUAL_TRANSFER',
    ]),
    channelCode: z.string().min(2).max(40),
    baseAmount: z.string().regex(/^\d+(\.\d+)?$/),
    ovoPhoneNumber: z.string().max(24).optional(),
    returnUrl: z.string().max(400).optional(),
    itemsSummary: z
      .array(
        z.object({
          name: z.string(),
          qty: z.number(),
          subtotal: z.string(),
        })
      )
      .optional(),
  });

  app.post('/api/payments/create', async (req, res) => {
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Parameter pembuatan tagihan tidak valid.',
        details: parsed.error.flatten(),
      });
    }

    const d = parsed.data;
    const rec = tenantDb.findWorkspaceByTenantId(d.tenantId);
    if (!rec) {
      return res.status(404).json({ error: 'Workspace usaha tidak ditemukan.' });
    }

    // Counter Screen requires authenticated tenant session; Mobile Self-Order is public
    if (d.checkoutMode === 'COUNTER_SCREEN') {
      const session = extractSessionFromRequest(req);
      if (!session || !assertTenantAccess(session, d.tenantId, rec.scope)) {
        return res.status(403).json({ error: 'Autentikasi kasir diperlukan untuk membuat tagihan counter.' });
      }
    }

    const cfg = getOrCreatePaymentConfig(d.tenantId);
    const uniqueCode =
      d.paymentCategory === 'MANUAL_TRANSFER'
        ? Math.floor(101 + Math.random() * 798)
        : 0;

    const breakdown = computePaymentBreakdown({
      baseAmount: d.baseAmount,
      paymentCategory: d.paymentCategory,
      feeBearer: cfg.feeBearer,
      qrisMdrPercent: cfg.qrisMdrPercent,
      vaFlatFee: cfg.vaFlatFee,
      ewalletFeePercent: cfg.ewalletFeePercent,
      uniqueCode,
    });

    const originBase = getOriginBase(req);
    const effectiveProvider: PaymentGatewayProvider =
      d.paymentCategory === 'MANUAL_TRANSFER'
        ? 'MANUAL_ONLY'
        : cfg.provider === 'MANUAL_ONLY'
          ? 'SIMULATOR'
          : cfg.provider;

    const callbackUrl = `${originBase}/api/webhooks/payment/${effectiveProvider.toLowerCase()}/${d.tenantId}`;
    const returnUrl =
      d.returnUrl ||
      `${originBase}/order/${rec.workspace.tenant.slug}/status/${encodeURIComponent(d.orderId || d.orderNumber)}`;

    let chargeResult;
    if (effectiveProvider === 'MANUAL_ONLY') {
      chargeResult = {
        provider: 'MANUAL_ONLY' as const,
        gatewayRefId: `MAN-${Date.now().toString(36).toUpperCase()}`,
        qrString: null,
        qrImageUrl: null,
        vaNumber: cfg.manualBankAccounts.find((b) => b.isActive)?.accountNumber ?? null,
        deeplinkUrl: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        isLiveGatewayCall: false,
        instructions: `Transfer tepat Rp${Number(breakdown.totalPayable).toLocaleString('id-ID')} (termasuk kode unik ${uniqueCode}) ke rekening tujuan.`,
      };
    } else {
      const decrypted = decryptConfigCredentials(cfg);
      // Graceful fallback to Simulator if live provider selected but keys not filled yet (e.g. Demo mode)
      const hasRequiredLiveKey =
        effectiveProvider === 'SIMULATOR' ||
        (effectiveProvider === 'MIDTRANS' && Boolean(decrypted.serverKey));

      const chosenAdapter = getPaymentAdapter(hasRequiredLiveKey ? effectiveProvider : 'SIMULATOR');
      try {
        chargeResult = await chosenAdapter.createCharge({
          tenantId: d.tenantId,
          tenantName: rec.workspace.tenant.name,
          orderNumber: d.orderNumber,
          paymentCategory: d.paymentCategory,
          channelCode: d.channelCode,
          checkoutMode: d.checkoutMode,
          totalPayable: breakdown.totalPayable,
          customerName: d.customerName,
          customerEmail: d.customerEmail,
          customerPhone: d.customerPhone,
          ovoPhoneNumber: d.ovoPhoneNumber,
          callbackUrl,
          returnUrl,
          credentials: decrypted,
        });
      } catch (err) {
        return res.status(502).json({
          error: err instanceof Error ? err.message : 'Gagal membuat tagihan ke Payment Gateway.',
        });
      }
    }

    const nowIso = new Date().toISOString();
    const txn: PaymentTransaction = {
      id: `ptx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId: d.tenantId,
      branchId: d.branchId ?? rec.workspace.branches?.[0]?.id ?? d.tenantId,
      orderId: d.orderId ?? null,
      boardingInvoiceId: d.boardingInvoiceId ?? null,
      orderNumber: d.orderNumber,
      customerName: d.customerName,
      tableNumber: d.tableNumber,
      provider: chargeResult.provider,
      checkoutMode: d.checkoutMode,
      paymentCategory: d.paymentCategory,
      channelCode: d.channelCode,
      baseAmount: breakdown.baseAmount,
      uniqueCode: breakdown.uniqueCode || null,
      customerAdminFee: breakdown.customerAdminFee,
      gatewayMdrFee: breakdown.gatewayMdrFee,
      totalPayable: breakdown.totalPayable,
      netSettlementAmount: breakdown.netSettlementAmount,
      gatewayRefId: chargeResult.gatewayRefId,
      qrString: chargeResult.qrString ?? null,
      qrImageUrl: chargeResult.qrImageUrl ?? null,
      vaNumber: chargeResult.vaNumber ?? null,
      deeplinkUrl: chargeResult.deeplinkUrl ?? null,
      ovoPhoneNumber: d.ovoPhoneNumber ?? null,
      manualProofUrl: null,
      status: d.paymentCategory === 'MANUAL_TRANSFER' ? 'WAITING_MANUAL_VERIFY' : 'PENDING',
      expiresAt: chargeResult.expiresAt,
      paidAt: null,
      createdAt: nowIso,
    };

    paymentTransactions = [txn, ...paymentTransactions].slice(0, 500);
    saveJsonFile(PAYMENT_TXNS_PATH, paymentTransactions);

    // Sync live Customer Facing Display (Mode 1 Counter Screen)
    if (d.checkoutMode === 'COUNTER_SCREEN') {
      const displayKey = txn.branchId || d.tenantId;
      const branchObj = rec.workspace.branches?.find((b) => b.id === displayKey);
      customerDisplayByBranch.set(displayKey, {
        branchId: displayKey,
        tenantId: d.tenantId,
        tenantName: rec.workspace.tenant.name,
        branchName: d.branchName || branchObj?.name || 'Kasir Utama',
        state: 'WAITING_PAYMENT',
        transaction: txn,
        itemsSummary: d.itemsSummary ?? [],
        updatedAt: nowIso,
      });
    }

    return res.status(201).json({
      transaction: txn,
      breakdown,
      instructions: chargeResult.instructions,
      manualBankAccounts: cfg.manualBankAccounts.filter((b) => b.isActive),
      feeBearer: cfg.feeBearer,
    });
  });

  // =========================================================================
  // 3. CUSTOMER FACING DISPLAY LIVE SYNC (/customer-display/:branchId)
  // =========================================================================

  app.get('/api/payments/customer-display/:branchId', (req, res) => {
    const branchId = String(req.params.branchId || '');
    const snapshot = customerDisplayByBranch.get(branchId);
    if (snapshot) {
      return res.status(200).json({ snapshot });
    }
    // Resolve tenant/branch name gracefully if display opened before first checkout
    const allWs = tenantDb.listAllWorkspaces();
    const matchedWs =
      allWs.find((w) => w.tenant.id === branchId) ||
      allWs.find((w) => w.branches?.some((b) => b.id === branchId));
    const matchedBranch = matchedWs?.branches?.find((b) => b.id === branchId);

    const idleSnapshot: CustomerDisplaySnapshot = {
      branchId,
      tenantId: matchedWs?.tenant.id ?? branchId,
      tenantName: matchedWs?.tenant.name ?? 'KasirAkun UMKM',
      branchName: matchedBranch?.name ?? 'Kasir Utama',
      state: 'IDLE',
      transaction: null,
      itemsSummary: [],
      updatedAt: new Date().toISOString(),
    };
    return res.status(200).json({ snapshot: idleSnapshot });
  });

  app.post('/api/payments/customer-display/:branchId/reset', (req, res) => {
    const branchId = String(req.params.branchId || '');
    const prev = customerDisplayByBranch.get(branchId);
    if (prev) {
      customerDisplayByBranch.set(branchId, {
        ...prev,
        state: 'IDLE',
        transaction: null,
        itemsSummary: [],
        updatedAt: new Date().toISOString(),
      });
    }
    return res.status(200).json({ reset: true });
  });

  // =========================================================================
  // 4. UNIVERSAL MULTI-PROVIDER WEBHOOK + CHECK STATUS + SIMULATE PAY
  // =========================================================================

  app.post('/api/webhooks/payment/:provider/:tenantId', (req, res) => {
    const providerRaw = String(req.params.provider || '').toUpperCase();
    const tenantId = String(req.params.tenantId || '');
    if (!(PROVIDERS_ENUM as readonly string[]).includes(providerRaw)) {
      return res.status(400).json({ error: 'Provider payment gateway tidak dikenal.' });
    }
    const provider = providerRaw as PaymentGatewayProvider;
    const cfg = getOrCreatePaymentConfig(tenantId);
    const decrypted = decryptConfigCredentials(cfg);
    const adapter = getPaymentAdapter(provider);

    const rawBody =
      (req as express.Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const parsedBody = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;

    const verification = adapter.verifyWebhook({
      rawBody,
      parsedBody,
      headers: req.headers,
      credentials: decrypted,
    });

    if (!verification.isValid) {
      return res.status(401).json({
        verified: false,
        error: verification.reason || 'Verifikasi tanda tangan webhook gagal.',
      });
    }

    const txn = paymentTransactions.find(
      (t) =>
        t.tenantId === tenantId &&
        ((verification.gatewayRefId && t.gatewayRefId === verification.gatewayRefId) ||
          (verification.orderNumber && t.orderNumber === verification.orderNumber) ||
          (parsedBody.transactionId && t.id === String(parsedBody.transactionId)))
    );

    if (!txn) {
      return res.status(404).json({ error: 'Transaksi pembayaran tidak ditemukan.' });
    }

    if (verification.isPaid) {
      const settled = applyPaidPaymentSettlement(txn, parsedBody);
      return res.status(200).json({
        verified: true,
        status: 'PAID',
        idempotentReplay: settled.idempotentReplay,
        transaction: settled.transaction,
        journalEntryId: settled.journalEntryId,
      });
    }

    if (verification.isExpiredOrFailed && txn.status === 'PENDING') {
      txn.status = 'EXPIRED';
      txn.rawWebhookPayload = parsedBody;
      paymentTransactions = paymentTransactions.map((t) => (t.id === txn.id ? txn : t));
      saveJsonFile(PAYMENT_TXNS_PATH, paymentTransactions);
    }

    return res.status(200).json({
      verified: true,
      status: txn.status,
      transaction: txn,
    });
  });

  app.post('/api/payments/:id/simulate-pay', (req, res) => {
    const txn = paymentTransactions.find((t) => t.id === req.params.id);
    if (!txn) {
      return res.status(404).json({ error: 'Transaksi pembayaran tidak ditemukan.' });
    }
    const payloadObj = {
      transactionId: txn.id,
      gatewayRefId: txn.gatewayRefId || txn.id,
      orderNumber: txn.orderNumber || txn.id,
      grossAmount: txn.totalPayable,
      status: 'PAID',
      simulatedAt: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(payloadObj);
    const sig = signSimulatorWebhook(rawBody);
    const simAdapter = getPaymentAdapter('SIMULATOR');
    const verify = simAdapter.verifyWebhook({
      rawBody,
      parsedBody: payloadObj,
      headers: { 'x-simulator-signature': sig },
      credentials: { environment: 'SANDBOX' },
    });
    if (!verify.isValid || !verify.isPaid) {
      return res.status(500).json({ error: 'Gagal memverifikasi simulasi webhook.' });
    }
    const settled = applyPaidPaymentSettlement(txn, payloadObj);
    return res.status(200).json({
      verified: true,
      status: 'PAID',
      idempotentReplay: settled.idempotentReplay,
      transaction: settled.transaction,
      journalEntryId: settled.journalEntryId,
    });
  });

  app.post('/api/payments/:id/check-status', (req, res) => {
    const txn = paymentTransactions.find((t) => t.id === req.params.id);
    if (!txn) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    }
    // Manual bank transfer approval by authenticated tenant owner/cashier
    if (req.body?.action === 'APPROVE_MANUAL' && txn.paymentCategory === 'MANUAL_TRANSFER') {
      const session = extractSessionFromRequest(req);
      const rec = tenantDb.findWorkspaceByTenantId(txn.tenantId);
      if (!session || !rec || !assertTenantAccess(session, txn.tenantId, rec.scope)) {
        return res.status(403).json({ error: 'Hanya kasir/pemilik usaha yang dapat menyetujui transfer manual.' });
      }
      const settled = applyPaidPaymentSettlement(txn, {
        approvedBy: session.email,
        approvedAt: new Date().toISOString(),
        source: 'MANUAL_BANK_VERIFICATION',
      });
      return res.status(200).json({
        verified: true,
        status: 'PAID',
        transaction: settled.transaction,
        journalEntryId: settled.journalEntryId,
      });
    }

    return res.status(200).json({
      status: txn.status,
      transaction: txn,
    });
  });

  app.get('/api/payments/transactions', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const tenantId = String(req.query.tenantId || '');
    const rec = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec || !assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    const list = paymentTransactions.filter((t) => t.tenantId === tenantId);
    return res.status(200).json({ transactions: list });
  });

  app.get('/api/payments/transactions/:id', (req, res) => {
    const txn = paymentTransactions.find(
      (t) => t.id === req.params.id || t.orderId === req.params.id || t.orderNumber === req.params.id
    );
    if (!txn) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    }
    const ticket = txn.orderId ? liveTickets.get(txn.orderId) : undefined;
    return res.status(200).json({
      transaction: txn,
      kitchenStatus: ticket?.kitchenStatus ?? (txn.status === 'PAID' ? 'PENDING' : null),
    });
  });

  // =========================================================================
  // 5. SETTLEMENT BATCH RECONCILIATION (H+1 / H+2 PG -> BANK UMKM)
  // =========================================================================

  app.get('/api/payments/settlements', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const tenantId = String(req.query.tenantId || '');
    const rec = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec || !assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    const batches = settlementBatches.filter((b) => b.tenantId === tenantId);
    const unsettledTxns = paymentTransactions.filter(
      (t) => t.tenantId === tenantId && t.status === 'PAID' && t.paymentCategory !== 'MANUAL_TRANSFER'
    );
    const pendingReceivable = unsettledTxns
      .reduce((acc, t) => acc.plus(t.netSettlementAmount), new Decimal(0))
      .toFixed(4);
    return res.status(200).json({
      batches,
      pendingReceivable,
      unsettledCount: unsettledTxns.length,
    });
  });

  const settlementCreateSchema = z.object({
    tenantId: z.string().min(1),
    provider: z.enum(PROVIDERS_ENUM),
    settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    totalGross: z.string().regex(/^\d+(\.\d+)?$/),
    totalGatewayFee: z.string().regex(/^\d+(\.\d+)?$/).default('0'),
    totalNetReceived: z.string().regex(/^\d+(\.\d+)?$/),
    destinationBankAccountId: z.string().min(1).default('1102'),
    notes: z.string().max(300).optional(),
  });

  app.post('/api/payments/settlements', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const parsed = settlementCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Data pencairan settlement tidak valid.',
        details: parsed.error.flatten(),
      });
    }
    const d = parsed.data;
    const rec = tenantDb.findWorkspaceByTenantId(d.tenantId);
    if (!rec || !assertTenantAccess(session, d.tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const ws = structuredClone(rec.workspace);
    const acc1102 = ensureSystemAccount(ws.accounts, d.tenantId, '1102', 'Bank Utama UMKM', 'ASSET', 'DEBIT');
    const acc1103 = ensureSystemAccount(ws.accounts, d.tenantId, '1103', 'Piutang Settlement Payment Gateway', 'ASSET', 'DEBIT');

    const journalDraft = buildSettlementBatchJournalLines({
      provider: d.provider,
      settlementDate: d.settlementDate,
      totalNetReceived: d.totalNetReceived,
      destinationBankAccountCode: '1102',
      destinationBankAccountName: acc1102.name,
    });

    const journalId = `je-stl-${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();
    const newEntry: JournalEntry = {
      id: journalId,
      tenantId: d.tenantId,
      entryNumber: `JRN-STL-${d.settlementDate.replace(/-/g, '')}-${String(
        ws.journalEntries.length + 1
      ).padStart(4, '0')}`,
      entryDate: d.settlementDate,
      sourceModule: 'POS',
      sourceId: journalId,
      description: `Rekonsiliasi Pencairan Settlement ${d.provider} ke Rekening Bank UMKM`,
      status: 'POSTED',
      reversedEntryId: null,
      lines: journalDraft.lines.map((l, idx) => ({
        id: `${journalId}-ln-${idx + 1}`,
        journalEntryId: journalId,
        accountId: l.accountCode === '1102' ? acc1102.id : acc1103.id,
        accountCodeSnapshot: l.accountCode,
        accountNameSnapshot: l.accountName,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo,
      })),
      createdAt: nowIso,
    };

    ws.journalEntries = [newEntry, ...ws.journalEntries];
    tenantDb.saveWorkspace(rec.scope, rec.ownerAccountId, ws);

    // Mark matching PAID transactions as SETTLED
    paymentTransactions = paymentTransactions.map((t) =>
      t.tenantId === d.tenantId && t.status === 'PAID' ? { ...t, status: 'SETTLED' } : t
    );
    saveJsonFile(PAYMENT_TXNS_PATH, paymentTransactions);

    const batch: SettlementBatch = {
      id: `stl-${Date.now().toString(36)}`,
      tenantId: d.tenantId,
      provider: d.provider,
      settlementDate: d.settlementDate,
      totalGross: new Decimal(d.totalGross).toFixed(4),
      totalGatewayFee: new Decimal(d.totalGatewayFee).toFixed(4),
      totalNetReceived: new Decimal(d.totalNetReceived).toFixed(4),
      destinationBankAccountId: d.destinationBankAccountId,
      journalEntryId: journalId,
      notes: d.notes ?? null,
      createdAt: nowIso,
    };
    settlementBatches = [batch, ...settlementBatches];
    saveJsonFile(SETTLEMENT_BATCHES_PATH, settlementBatches);

    return res.status(201).json({
      batch,
      journalEntry: newEntry,
    });
  });

  // =========================================================================
  // 6. PAYMENT SETUP ASSISTANCE REQUESTS (TENANT + MASTER ADMIN)
  // =========================================================================

  const assistRequestSchema = z.object({
    tenantId: z.string().min(1),
    preferredProvider: z.enum(['MIDTRANS', 'MANUAL_ONLY']),
    hasExistingAccount: z.boolean().default(false),
    settlementBankName: z.string().min(2).max(60),
    settlementAccountHolder: z.string().min(2).max(120),
    whatsappNumber: z.string().min(8).max(25),
    businessLegality: z.enum(['PERORANGAN_KTP', 'PT_PERORANGAN', 'CV_PT']).default('PERORANGAN_KTP'),
    notes: z.string().max(500).optional(),
  });

  app.get('/api/payments/assistance-requests', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const tenantId = String(req.query.tenantId || '');
    const rec = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec || !assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    const list = paymentAssistRequests.filter((r) => r.tenantId === tenantId);
    return res.status(200).json({ requests: list });
  });

  app.post('/api/payments/assistance-requests', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    const parsed = assistRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Formulir permintaan bantuan belum lengkap.',
        details: parsed.error.flatten(),
      });
    }
    const d = parsed.data;
    const rec = tenantDb.findWorkspaceByTenantId(d.tenantId);
    if (!rec || !assertTenantAccess(session, d.tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const ownerCust = tenantDb.findCustomerById(rec.ownerAccountId);
    const nowIso = new Date().toISOString();
    const ticket: PaymentSetupAssistanceRequest = {
      id: `passist-${Date.now().toString(36)}`,
      tenantId: d.tenantId,
      tenantName: rec.workspace.tenant.name,
      tenantVertical: rec.workspace.tenant.vertical,
      ownerName: ownerCust?.fullName || session.email,
      requestedByUserId: session.ownerAccountId || session.email,
      preferredProvider: d.preferredProvider,
      hasExistingAccount: d.hasExistingAccount,
      settlementBankName: d.settlementBankName.trim(),
      settlementAccountHolder: d.settlementAccountHolder.trim(),
      whatsappNumber: d.whatsappNumber.trim(),
      businessLegality: d.businessLegality,
      notes: d.notes?.trim() || null,
      status: 'PENDING',
      adminNotes: null,
      handledByAdminId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    paymentAssistRequests = [ticket, ...paymentAssistRequests];
    saveJsonFile(PAYMENT_ASSIST_PATH, paymentAssistRequests);

    const cfg = getOrCreatePaymentConfig(d.tenantId);
    upsertPaymentConfig({
      ...cfg,
      setupStatus: 'ASSISTANCE_REQUESTED',
      updatedAt: nowIso,
    });

    return res.status(201).json({ request: ticket });
  });

  // Master Admin — List All Payment Assistance Requests
  app.get('/api/master/payment-assistance', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const originBase = getOriginBase(req);
    const enriched = paymentAssistRequests.map((r) => {
      const cfg = getOrCreatePaymentConfig(r.tenantId);
      const rec = tenantDb.findWorkspaceByTenantId(r.tenantId);
      return {
        ...r,
        tenantName: r.tenantName || rec?.workspace.tenant.name || r.tenantId,
        tenantVertical: r.tenantVertical || rec?.workspace.tenant.vertical || 'WARUNG_SEMBAKO',
        currentConfig: sanitizePaymentConfigForClient(cfg, originBase),
      };
    });
    return res.status(200).json({ requests: enriched });
  });

  app.patch('/api/master/payment-assistance/:id', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const schema = z.object({
      status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']).optional(),
      adminNotes: z.string().max(500).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Update tiket tidak valid.' });
    }
    const idx = paymentAssistRequests.findIndex((r) => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });

    const nowIso = new Date().toISOString();
    const updated: PaymentSetupAssistanceRequest = {
      ...paymentAssistRequests[idx],
      status: parsed.data.status ?? paymentAssistRequests[idx].status,
      adminNotes:
        parsed.data.adminNotes !== undefined
          ? parsed.data.adminNotes
          : paymentAssistRequests[idx].adminNotes,
      handledByAdminId: session.email,
      updatedAt: nowIso,
    };
    paymentAssistRequests[idx] = updated;
    saveJsonFile(PAYMENT_ASSIST_PATH, paymentAssistRequests);

    if (updated.status === 'IN_PROGRESS') {
      const cfg = getOrCreatePaymentConfig(updated.tenantId);
      upsertPaymentConfig({ ...cfg, setupStatus: 'ASSISTANCE_IN_PROGRESS', updatedAt: nowIso });
    }

    return res.status(200).json({ request: updated });
  });

  // Master Admin — Assisted Gateway Configuration Drawer (Encrypts & Activates for Tenant)
  app.post('/api/master/payment-assistance/:id/configure', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const idx = paymentAssistRequests.findIndex((r) => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });

    const schema = z.object({
      provider: z.enum(PROVIDERS_ENUM),
      environment: z.enum(['SANDBOX', 'PRODUCTION']).default('PRODUCTION'),
      merchantCode: z.string().max(120).optional().nullable(),
      serverKey: z.string().max(300).optional(),
      clientKey: z.string().max(300).optional(),
      privateKey: z.string().max(300).optional(),
      feeBearer: z.enum(['MERCHANT', 'CUSTOMER']).default('CUSTOMER'),
      adminNotes: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Kredensial konfigurasi tidak valid.',
        details: parsed.error.flatten(),
      });
    }

    const ticket = paymentAssistRequests[idx];
    const d = parsed.data;
    const existingCfg = getOrCreatePaymentConfig(ticket.tenantId);
    const nowIso = new Date().toISOString();

    const updatedCfg: TenantPaymentConfig = {
      ...existingCfg,
      provider: d.provider,
      environment: d.environment,
      merchantCode: d.merchantCode ?? existingCfg.merchantCode ?? null,
      encryptedServerKey: d.serverKey?.trim()
        ? encryptSecret(d.serverKey)
        : existingCfg.encryptedServerKey ?? null,
      maskedServerKey: d.serverKey?.trim()
        ? maskSecretKey(d.serverKey)
        : existingCfg.maskedServerKey ?? null,
      encryptedClientKey: d.clientKey?.trim()
        ? encryptSecret(d.clientKey)
        : existingCfg.encryptedClientKey ?? null,
      maskedClientKey: d.clientKey?.trim()
        ? maskSecretKey(d.clientKey)
        : existingCfg.maskedClientKey ?? null,
      encryptedPrivateKey: d.privateKey?.trim()
        ? encryptSecret(d.privateKey)
        : existingCfg.encryptedPrivateKey ?? null,
      maskedPrivateKey: d.privateKey?.trim()
        ? maskSecretKey(d.privateKey)
        : existingCfg.maskedPrivateKey ?? null,
      feeBearer: d.feeBearer,
      setupStatus: d.provider === 'MANUAL_ONLY' ? 'MANUAL_ONLY' : 'ACTIVE',
      configuredByAdminId: session.email,
      lastTestedAt: nowIso,
      updatedAt: nowIso,
    };
    upsertPaymentConfig(updatedCfg);

    const updatedTicket: PaymentSetupAssistanceRequest = {
      ...ticket,
      preferredProvider: d.provider,
      status: 'COMPLETED',
      adminNotes: d.adminNotes || `Dikonfigurasi & diaktifkan oleh ${session.email}`,
      handledByAdminId: session.email,
      updatedAt: nowIso,
    };
    paymentAssistRequests[idx] = updatedTicket;
    saveJsonFile(PAYMENT_ASSIST_PATH, paymentAssistRequests);

    return res.status(200).json({
      ok: true,
      request: updatedTicket,
      config: sanitizePaymentConfigForClient(updatedCfg, getOriginBase(req)),
    });
  });

  // =========================================================================
  // 6B. MASTER ADMIN DIRECT PER-TENANT PAYMENT GATEWAY SETUP (NO REQUEST NEEDED)
  //     Strictly isolated per tenantId — 1 user's non-cash credentials never mix
  // =========================================================================

  app.get('/api/master/tenants/payment-configs', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const originBase = getOriginBase(req);
    const customers = tenantDb.listCustomers();
    const workspaces = tenantDb.listAllWorkspaces();

    const items = workspaces.map((ws) => {
      const owner = customers.find((c) => c.primaryTenantId === ws.tenant.id);
      const cfg = getOrCreatePaymentConfig(ws.tenant.id);
      return {
        tenantId: ws.tenant.id,
        tenantName: ws.tenant.name,
        vertical: ws.tenant.vertical,
        planCode: ws.tenant.subscriptionPlan || 'BASIC',
        isDemo: owner?.isDemoAccount ?? ws.tenant.id.startsWith('tenant-'),
        ownerName: owner?.fullName ?? ws.tenant.name,
        ownerEmail: owner?.email ?? '',
        ownerPhone: owner?.phone ?? '',
        config: sanitizePaymentConfigForClient(cfg, originBase),
      };
    });

    return res.status(200).json({ tenants: items });
  });

  app.put('/api/master/tenants/:tenantId/payment-config', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const tenantId = String(req.params.tenantId || '').trim();
    const tenantRecord = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!tenantRecord) {
      return res.status(404).json({ error: 'Akun usaha (tenant) tidak ditemukan.' });
    }

    const schema = z.object({
      provider: z.enum(PROVIDERS_ENUM),
      environment: z.enum(['SANDBOX', 'PRODUCTION']).default('PRODUCTION'),
      merchantCode: z.string().max(120).optional().nullable(),
      serverKey: z.string().max(300).optional(),
      clientKey: z.string().max(300).optional(),
      privateKey: z.string().max(300).optional(),
      feeBearer: z.enum(['MERCHANT', 'CUSTOMER']).default('CUSTOMER'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Data pengaturan pembayaran non-tunai tidak valid.',
        details: parsed.error.flatten(),
      });
    }

    const d = parsed.data;
    const existingCfg = getOrCreatePaymentConfig(tenantId);
    const nowIso = new Date().toISOString();

    const updatedCfg: TenantPaymentConfig = {
      ...existingCfg,
      tenantId,
      provider: d.provider,
      environment: d.environment,
      merchantCode: d.merchantCode !== undefined ? d.merchantCode : existingCfg.merchantCode ?? null,
      encryptedServerKey: d.serverKey?.trim()
        ? encryptSecret(d.serverKey)
        : existingCfg.encryptedServerKey ?? null,
      maskedServerKey: d.serverKey?.trim()
        ? maskSecretKey(d.serverKey)
        : existingCfg.maskedServerKey ?? null,
      encryptedClientKey: d.clientKey?.trim()
        ? encryptSecret(d.clientKey)
        : existingCfg.encryptedClientKey ?? null,
      maskedClientKey: d.clientKey?.trim()
        ? maskSecretKey(d.clientKey)
        : existingCfg.maskedClientKey ?? null,
      encryptedPrivateKey: d.privateKey?.trim()
        ? encryptSecret(d.privateKey)
        : existingCfg.encryptedPrivateKey ?? null,
      maskedPrivateKey: d.privateKey?.trim()
        ? maskSecretKey(d.privateKey)
        : existingCfg.maskedPrivateKey ?? null,
      feeBearer: d.feeBearer,
      setupStatus: d.provider === 'MANUAL_ONLY' ? 'MANUAL_ONLY' : 'ACTIVE',
      configuredByAdminId: session.email,
      lastTestedAt: nowIso,
      updatedAt: nowIso,
    };
    upsertPaymentConfig(updatedCfg);

    return res.status(200).json({
      ok: true,
      tenantId,
      tenantName: tenantRecord.workspace.tenant.name,
      config: sanitizePaymentConfigForClient(updatedCfg, getOriginBase(req)),
    });
  });

  // =========================================================================
  // 7. MASTER ADMIN CUSTOM WHATSAPP TEMPLATES CRUD
  // =========================================================================

  app.get('/api/master/wa-templates', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat mengelola template WA.' });
    }
    return res.status(200).json({ templates: waTemplates });
  });

  const waTemplateSchema = z.object({
    code: z
      .string()
      .min(3)
      .max(60)
      .regex(/^[A-Z0-9_]+$/, 'Kode template hanya boleh huruf kapital, angka, dan underscore (_)'),
    title: z.string().min(3).max(120),
    category: z.enum(['PAYMENT_ASSIST', 'DEMO', 'GENERAL']).default('PAYMENT_ASSIST'),
    bodyTemplate: z.string().min(10).max(4000),
    isActive: z.boolean().default(true),
  });

  app.post('/api/master/wa-templates', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const parsed = waTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Format template WhatsApp tidak valid.',
        details: parsed.error.flatten(),
      });
    }
    if (waTemplates.some((t) => t.code === parsed.data.code)) {
      return res.status(409).json({ error: `Kode template ${parsed.data.code} sudah digunakan.` });
    }
    const created: WaMessageTemplate = {
      id: `wa-tpl-${Date.now().toString(36)}`,
      ...parsed.data,
      updatedByAdminId: session.email,
      updatedAt: new Date().toISOString(),
    };
    waTemplates = [...waTemplates, created];
    saveJsonFile(WA_TEMPLATES_PATH, waTemplates);
    return res.status(201).json({ template: created });
  });

  app.put('/api/master/wa-templates/:id', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const parsed = waTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Format template WhatsApp tidak valid.',
        details: parsed.error.flatten(),
      });
    }
    const idx = waTemplates.findIndex((t) => t.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Template tidak ditemukan.' });

    const duplicate = waTemplates.find(
      (t) => t.code === parsed.data.code && t.id !== req.params.id
    );
    if (duplicate) {
      return res.status(409).json({ error: `Kode template ${parsed.data.code} sudah digunakan.` });
    }

    const updated: WaMessageTemplate = {
      ...waTemplates[idx],
      ...parsed.data,
      updatedByAdminId: session.email,
      updatedAt: new Date().toISOString(),
    };
    waTemplates[idx] = updated;
    saveJsonFile(WA_TEMPLATES_PATH, waTemplates);
    return res.status(200).json({ template: updated });
  });

  app.delete('/api/master/wa-templates/:id', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const before = waTemplates.length;
    waTemplates = waTemplates.filter((t) => t.id !== req.params.id);
    if (waTemplates.length === before) {
      return res.status(404).json({ error: 'Template tidak ditemukan.' });
    }
    saveJsonFile(WA_TEMPLATES_PATH, waTemplates);
    return res.status(200).json({ deleted: true });
  });
}
