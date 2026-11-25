/**
 * KasirAkun UMKM — Extended 6 Realistic Demo Workspaces (30-Day Data) + SystemDemoConfig
 * Covers:
 * 1. Warung Makmur Jaya (WARUNG_SEMBAKO): 2 Cabang + 1 Gudang Pusat, Transfer Stok, PriceTiers, Supplier PO, Blind Opname, Shift & Anti-Fraud sample
 * 2. Kedai Nusantara (KEDAI_MAKAN): Menu + Resep BOM + KDS + Promo
 * 3. Resto Rasa Bali (RESTORAN): Foto Menu, 8 QR Meja, Open/Split Bill, PB1 10%, Promo
 * 4. Studio Desain Kreatif (FREELANCE): Invoice Proyek, PPh 23, Penyusutan Laptop
 * 5. Kost Griya Nyaman (KOST_KONTRAKAN): 12 Kamar, Penghuni, Deposit Liability (2106), Tagihan Bulanan + WA, PPh 4(2) 10%
 * 6. Agro Ternak Mandiri (PETERNAKAN_PERTANIAN): Ayam Broiler Batch #4 & Padi Blok B, Pemakaian Pakan/Pupuk WIP (1109), Panen & HPP/Kg (1110)
 */

import { DEFAULT_CHART_OF_ACCOUNTS } from '../../prisma/seed.ts';
import { buildJournalEntry } from '../lib/accounting/journal-engine.ts';
import { buildHierarchicalTaxonomyFromPresets } from '../lib/catalog/taxonomy-presets.ts';
import { ensureBranchStocksForTenant } from '../lib/inventory/multi-branch-engine.ts';
import { processOrderCheckout } from '../lib/pos/checkout-service.ts';
import {
  calculateBoardingInvoice,
  createBoardingDepositJournal,
  createBoardingRentPaymentJournal,
  recordAgroBatchUsage,
  recordAgroHarvest,
} from '../lib/verticals/kost-agro-engine.ts';
import type {
  Account,
  AgroBatch,
  AuditLog,
  BoardingInvoice,
  BoardingRoom,
  BoardingTenant,
  Branch,
  CashierShift,
  Category,
  CrmCustomer,
  DemoAppointmentRequest,
  ManagedCustomerAccount,
  PriceTier,
  Product,
  Promotion,
  PurchaseOrder,
  StockOpnameSession,
  StockTransfer,
  Supplier,
  SystemDemoConfig,
  Tenant,
  TenantWorkspaceData,
} from '../types/domain.ts';

function makeAccounts(tenantId: string): Account[] {
  return DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
    id: `${tenantId}-acc-${a.code}`,
    tenantId,
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
    isSystemLocked: a.isSystemLocked,
  }));
}

export const DEFAULT_SYSTEM_DEMO_CONFIG: SystemDemoConfig = {
  globalDemoMode: 'PUBLIC_INSTANT',
  demoMode: 'PUBLIC_INSTANT',
  requireRegistrationForDemo: false,
  defaultDemoDurationDays: 7,
  defaultDurationDays: 7,
  customEnabledPlan: 'EXPERT',
  allowedDemoPlan: 'EXPERT',
  customEnabledAddOns: ['ADDON_EXTRA_BRANCH', 'ADDON_RESTO_QR_KDS'],
  allowAiInDemo: false,
  demoVisibility: {
    WARUNG_SEMBAKO: true,
    TOKO_RETAIL: true,
    TOKO_FASHION: true,
    TOKO_BANGUNAN: true,
    KEDAI_MAKAN: true,
    RESTORAN: true,
    BAKERY_CATERING: true,
    MANUFAKTUR_KECIL: true,
    LAUNDRY: true,
    CUCI_KENDARAAN: true,
    BARBERSHOP: true,
    SALON_KECANTIKAN: true,
    SPA_WELLNESS: true,
    BARBERSHOP_SALON: true,
    PET_SHOP: true,
    BIMBEL_KURSUS_GYM: true,
    FREELANCE: true,
    KOST_KONTRAKAN: true,
    HOMESTAY_VILLA: true,
    RENTAL_KENDARAAN: true,
    SEWA_LAPANGAN: true,
    SEWA_GARASI: true,
    PETERNAKAN_PERTANIAN: true,
  },
  visibleDemoVerticals: [
    'WARUNG_SEMBAKO',
    'TOKO_RETAIL',
    'TOKO_FASHION',
    'TOKO_BANGUNAN',
    'KEDAI_MAKAN',
    'RESTORAN',
    'BAKERY_CATERING',
    'MANUFAKTUR_KECIL',
    'LAUNDRY',
    'CUCI_KENDARAAN',
    'BARBERSHOP',
    'SALON_KECANTIKAN',
    'SPA_WELLNESS',
    'PET_SHOP',
    'BIMBEL_KURSUS_GYM',
    'FREELANCE',
    'KOST_KONTRAKAN',
    'HOMESTAY_VILLA',
    'RENTAL_KENDARAAN',
    'SEWA_LAPANGAN',
    'SEWA_GARASI',
    'PETERNAKAN_PERTANIAN',
  ],
  updatedAt: '2026-11-15T08:00:00.000Z',
};

export const INITIAL_DEMO_APPOINTMENTS: DemoAppointmentRequest[] = [
  {
    id: 'req-demo-001',
    fullName: 'Hendra Wijaya',
    businessName: 'Minimarket Berkah Sentosa',
    vertical: 'WARUNG_SEMBAKO',
    whatsappNumber: '0812-8877-6655',
    email: 'hendra@berkahsentosa.id',
    branchCount: 3,
    preferredSchedule: '2026-11-22 10:00 WIB',
    notes: 'Ingin coba alur transfer stok gudang pusat ke 2 cabang + harga grosir karton.',
    status: 'PENDING',
    createdAt: '2026-11-18T09:15:00.000Z',
  },
  {
    id: 'req-demo-002',
    fullName: 'Ibu Ratna Sari',
    businessName: 'Kost Eksekutif Melati',
    vertical: 'KOST_KONTRAKAN',
    whatsappNumber: '0813-5544-3322',
    email: 'ratna@kostmelati.id',
    branchCount: 1,
    preferredSchedule: '2026-11-23 14:00 WIB',
    notes: 'Punya 24 kamar kost, butuh pencatatan deposit penghuni & tagihan WA otomatis.',
    status: 'PENDING',
    createdAt: '2026-11-19T11:30:00.000Z',
  },
];

/**
 * Enriches the existing 4 base workspaces (Warung, Kedai, Resto, Freelance) with:
 * - Updated realistic demo branding & Multi-Branch setup (Warung Makmur Jaya: 2 Cabang + 1 Gudang Pusat)
 * - BranchStock matrix, StockTransfer history, Suppliers, POs, Blind Opname, Shifts, Promos, PriceTiers, CRM
 */
export function enrichBaseWorkspaces(baseWorkspaces: TenantWorkspaceData[]): TenantWorkspaceData[] {
  const now = '2026-11-19T08:00:00.000Z';

  return baseWorkspaces.map((ws) => {
    const tId = ws.tenant.id;
    const vertical = ws.tenant.vertical;

    // Ensure all 36 CoA accounts exist (additive upgrade for old workspaces)
    const existingCodes = new Set(ws.accounts.map((a) => a.code));
    const mergedAccounts: Account[] = [
      ...ws.accounts,
      ...DEFAULT_CHART_OF_ACCOUNTS.filter((a) => !existingCodes.has(a.code)).map((a) => ({
        id: `${tId}-acc-${a.code}`,
        tenantId: tId,
        code: a.code,
        name: a.name,
        category: a.category,
        normalBalance: a.normalBalance,
        isSystemLocked: a.isSystemLocked,
      })),
    ];

    if (vertical === 'WARUNG_SEMBAKO') {
      const branches: Branch[] = [
        {
          id: `${tId}-br-wh`,
          tenantId: tId,
          code: 'GDG-01',
          name: 'Gudang Pusat Makmur',
          branchType: 'CENTRAL_WAREHOUSE',
          address: 'Jl. Raya Logistik No. 8, Bekasi',
          phone: '0813-7745-1000',
          nitku22: '3275011508880002000001',
          isDefault: true,
          isActive: true,
          createdAt: '2026-10-01T08:00:00.000Z',
        },
        {
          id: `${tId}-br-cab1`,
          tenantId: tId,
          code: 'CAB-01',
          name: 'Toko Cabang Utama (Pasar Baru)',
          branchType: 'OUTLET',
          address: 'Jl. Pasar Baru Blok B No. 12, Bekasi',
          phone: '0813-7745-1002',
          nitku22: '3275011508880002000002',
          isDefault: false,
          isActive: true,
          createdAt: '2026-10-01T08:00:00.000Z',
        },
        {
          id: `${tId}-br-cab2`,
          tenantId: tId,
          code: 'CAB-02',
          name: 'Toko Cabang Timur (Harapan Indah)',
          branchType: 'OUTLET',
          address: 'Ruko Harapan Indah Blok C4, Bekasi',
          phone: '0813-7745-1003',
          nitku22: '3275011508880002000003',
          isDefault: false,
          isActive: true,
          createdAt: '2026-10-15T08:00:00.000Z',
        },
      ];

      const retailProducts = ws.products.filter((p) => p.itemType === 'RETAIL_GOODS');
      const baseStocks = ensureBranchStocksForTenant({
        tenantId: tId,
        branches,
        products: ws.products,
        existingStocks: [],
      }).map((bs, idx) => {
        if (bs.branchId === `${tId}-br-wh`) {
          return { ...bs, stockQty: '85.0000', minStockAlert: '20.0000' };
        }
        if (bs.branchId === `${tId}-br-cab1`) {
          // Make first item intentionally low so Matrix red alert highlights clearly
          return { ...bs, stockQty: idx % 3 === 0 ? '4.0000' : '24.0000', minStockAlert: '10.0000' };
        }
        return { ...bs, stockQty: idx % 2 === 0 ? '6.0000' : '18.0000', minStockAlert: '8.0000' };
      });

      const p0 = retailProducts[0];
      const p1 = retailProducts[1] ?? p0;

      const stockTransfers: StockTransfer[] = p0
        ? [
            {
              id: 'trf-w-001',
              tenantId: tId,
              transferNumber: 'TRF-20261116-0001',
              sourceBranchId: `${tId}-br-wh`,
              destinationBranchId: `${tId}-br-cab1`,
              status: 'RECEIVED',
              requestedBy: 'Siti (Kepala Toko Cabang 1)',
              notes: 'Restok rutin akhir pekan',
              shippedAt: '2026-11-16T08:30:00.000Z',
              receivedAt: '2026-11-16T11:15:00.000Z',
              items: [
                {
                  id: 'trfi-w-1',
                  productId: p0.id,
                  productNameSnapshot: p0.name,
                  unit: p0.unit,
                  requestedQty: '15.0000',
                  shippedQty: '15.0000',
                  receivedQty: '15.0000',
                  damagedQty: '0.0000',
                  unitCostAtShip: p0.costPriceAvg,
                },
              ],
              createdAt: '2026-11-16T07:45:00.000Z',
            },
            {
              id: 'trf-w-002',
              tenantId: tId,
              transferNumber: 'TRF-20261119-0002',
              sourceBranchId: `${tId}-br-wh`,
              destinationBranchId: `${tId}-br-cab2`,
              status: 'IN_TRANSIT',
              requestedBy: 'Bambang (Cabang Timur)',
              notes: 'Sedang dikirim armada pick-up B 9123 KLA',
              shippedAt: '2026-11-19T06:45:00.000Z',
              items: [
                {
                  id: 'trfi-w-2',
                  productId: p1.id,
                  productNameSnapshot: p1.name,
                  unit: p1.unit,
                  requestedQty: '12.0000',
                  shippedQty: '12.0000',
                  receivedQty: '0.0000',
                  damagedQty: '0.0000',
                  unitCostAtShip: p1.costPriceAvg,
                },
              ],
              createdAt: '2026-11-19T06:00:00.000Z',
            },
          ]
        : [];

      const suppliers: Supplier[] = [
        {
          id: 'sup-w-1',
          tenantId: tId,
          name: 'PT Indomarco Adi Prima (Distributor Sembako)',
          phone: '021-8899-2211',
          address: 'Kawasan Industri Jababeka, Cikarang',
          defaultTermDays: 14,
          notes: 'Pengiriman setiap Selasa & Jumat',
          createdAt: '2026-10-01T08:00:00.000Z',
        },
        {
          id: 'sup-w-2',
          tenantId: tId,
          name: 'CV Sumber Pangan Nusantara',
          phone: '0812-4455-7788',
          address: 'Pasar Induk Cipinang, Jakarta Timur',
          defaultTermDays: 7,
          notes: 'Pemasok beras Rojolele & Pandan Wangi',
          createdAt: '2026-10-01T08:00:00.000Z',
        },
      ];

      const purchaseOrders: PurchaseOrder[] = p0
        ? [
            ...(ws.purchaseOrders ?? []),
            {
              id: 'po-w-tempo-1',
              tenantId: tId,
              branchId: `${tId}-br-wh`,
              supplierId: 'sup-w-1',
              poNumber: 'PO-20261114-001',
              supplierName: 'PT Indomarco Adi Prima (Distributor Sembako)',
              status: 'RECEIVED',
              paymentType: 'TEMPO_HUTANG',
              dueDate: '2026-11-28',
              landedCostShipping: '150000.0000',
              totalEstimatedCost: '4150000.0000',
              amountPaid: '1500000.0000',
              receivedAt: '2026-11-14T14:00:00.000Z',
              notes: 'Tempo 14 hari — cicilan pertama via Transfer BCA',
              items: [
                {
                  productId: p0.id,
                  productName: p0.name,
                  unit: p0.unit,
                  orderedQty: '50.0000',
                  receivedQty: '50.0000',
                  unitCostEstimate: '80000.0000',
                  lineTotal: '4150000.0000',
                },
              ],
              debtPayments: [
                {
                  id: 'dp-w-1',
                  paidAt: '2026-11-17T10:00:00.000Z',
                  amount: '1500000.0000',
                  paymentAccountCode: '1102',
                  notes: 'Pembayaran parsial tahap 1',
                },
              ],
              createdAt: '2026-11-14T09:00:00.000Z',
            },
          ]
        : ws.purchaseOrders ?? [];

      const priceTiers: PriceTier[] = retailProducts.slice(0, 3).flatMap((prod, idx) => [
        {
          id: `pt-w-${idx}-1`,
          tenantId: tId,
          productId: prod.id,
          minQty: '6.0000',
          tierPrice: String(Math.max(1000, Math.round(Number(prod.sellingPrice) * 0.95))) + '.0000',
          label: 'Grosir 6+',
        },
        {
          id: `pt-w-${idx}-2`,
          tenantId: tId,
          productId: prod.id,
          minQty: '12.0000',
          tierPrice: String(Math.max(1000, Math.round(Number(prod.sellingPrice) * 0.9))) + '.0000',
          label: 'Karton 12+',
        },
      ]);

      const promotions: Promotion[] = [
        {
          id: 'promo-w-1',
          tenantId: tId,
          name: 'Diskon Belanja Grosir 5% (Min Rp250rb)',
          promoType: 'PERCENT',
          discountValue: '5.0000',
          minPurchase: '250000.0000',
          isActive: true,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'promo-w-2',
          tenantId: tId,
          name: 'Potongan Member Rp10.000',
          promoType: 'FIXED',
          discountValue: '10000.0000',
          minPurchase: '150000.0000',
          isActive: true,
          createdAt: '2026-11-05T00:00:00.000Z',
        },
      ];

      const crmCustomers: CrmCustomer[] = [
        {
          id: 'crm-w-1',
          tenantId: tId,
          name: 'Ibu Warteg Bahari',
          phoneWa: '0812-3311-9001',
          email: 'wartegbahari@gmail.com',
          totalSpend: '6450000.0000',
          loyaltyPoints: 645,
          receivableBalance: '850000.0000',
          notes: 'Langganan beras & minyak goreng tiap Senin (tempo 7 hari)',
          createdAt: '2026-10-05T08:00:00.000Z',
        },
        {
          id: 'crm-w-2',
          tenantId: tId,
          name: 'Pak Joko Catering',
          phoneWa: '0813-8822-4411',
          totalSpend: '4200000.0000',
          loyaltyPoints: 420,
          receivableBalance: '0.0000',
          notes: 'Beli gula & tepung per karton',
          createdAt: '2026-10-12T08:00:00.000Z',
        },
      ];

      const cashierShifts: CashierShift[] = [
        {
          id: 'sh-w-1',
          tenantId: tId,
          branchId: `${tId}-br-cab1`,
          cashierName: 'Sari Kasir',
          cashierEmail: 'kasir.warung@kasirakun.id',
          openedAt: '2026-11-17T07:00:00.000Z',
          closedAt: '2026-11-17T16:00:00.000Z',
          openingCash: '500000.0000',
          expectedCash: '2850000.0000',
          actualClosingCash: '2850000.0000',
          cashVariance: '0.0000',
          status: 'CLOSED',
        },
        {
          id: 'sh-w-2',
          tenantId: tId,
          branchId: `${tId}-br-cab1`,
          cashierName: 'Sari Kasir',
          cashierEmail: 'kasir.warung@kasirakun.id',
          openedAt: '2026-11-18T07:00:00.000Z',
          closedAt: '2026-11-18T16:00:00.000Z',
          openingCash: '500000.0000',
          expectedCash: '3120000.0000',
          actualClosingCash: '3120000.0000',
          cashVariance: '0.0000',
          status: 'CLOSED',
        },
      ];

      const auditLogs: AuditLog[] = [];

      const stockOpnameSessions: StockOpnameSession[] = p0
        ? [
            {
              id: 'opn-w-1',
              tenantId: tId,
              branchId: `${tId}-br-cab1`,
              sessionNumber: 'SO-20261115-0001',
              isBlindCount: true,
              status: 'APPROVED',
              createdBy: 'Petugas SO',
              approvedBy: 'Hj. Siti Aminah',
              approvedAt: '2026-11-15T18:00:00.000Z',
              totalVarianceValue: '-72000.0000',
              items: [
                {
                  id: 'opni-w-1',
                  productId: p0.id,
                  productNameSnapshot: p0.name,
                  unit: p0.unit,
                  systemQtySnapshot: '25.0000',
                  physicalQty: '24.0000',
                  varianceQty: '-1.0000',
                  unitCostSnapshot: '72000.0000',
                  varianceValue: '-72000.0000',
                },
              ],
              createdAt: '2026-11-15T16:30:00.000Z',
            },
          ]
        : [];

      return {
        ...ws,
        tenant: {
          ...ws.tenant,
          name: 'Warung Makmur Jaya',
          subscriptionPlan: 'EXPERT',
          activeAddOns: ['ADDON_EXTRA_BRANCH'],
        },
        accounts: mergedAccounts,
        branches,
        branchStocks: baseStocks,
        stockTransfers,
        suppliers,
        purchaseOrders,
        stockOpnameSessions,
        cashierShifts,
        auditLogs,
        promotions,
        priceTiers,
        crmCustomers,
        orders: ws.orders.map((o, idx) => ({
          ...o,
          branchId: idx % 2 === 0 ? `${tId}-br-cab1` : `${tId}-br-cab2`,
          orderMode: 'TAKEAWAY',
        })),
      };
    }

    // Default enrichment for Kedai Nusantara, Resto Rasa Bali, Studio Desain Kreatif
    const renamedTitle =
      vertical === 'KEDAI_MAKAN'
        ? 'Kedai Nusantara'
        : vertical === 'RESTORAN'
        ? 'Resto Rasa Bali'
        : 'Studio Desain Kreatif';

    const hqBranch: Branch = {
      id: `${tId}-br-hq`,
      tenantId: tId,
      code: 'CAB-01',
      name: `${renamedTitle} — Pusat`,
      branchType: 'OUTLET',
      address: ws.tenant.address,
      phone: '0812-3456-7890',
      nitku22: ws.tenant.nitku22,
      isDefault: true,
      isActive: true,
      createdAt: ws.tenant.createdAt,
    };

    const extraTables =
      vertical === 'RESTORAN' && ws.tables.length < 8
        ? [
            ...ws.tables,
            ...Array.from({ length: 8 - ws.tables.length }, (_, idx) => {
              const num = String(ws.tables.length + idx + 1).padStart(2, '0');
              return {
                id: `${tId}-tbl-${num}`,
                tenantId: tId,
                tableNumber: num,
                qrToken: `qr-resto-rasa-bali-meja-${num}`,
                isActive: true,
              };
            }),
          ]
        : ws.tables;

    const promotions: Promotion[] =
      vertical === 'RESTORAN' || vertical === 'KEDAI_MAKAN'
        ? [
            {
              id: `promo-${tId}-1`,
              tenantId: tId,
              name: 'Happy Hour Diskon 10%',
              promoType: 'PERCENT',
              discountValue: '10.0000',
              minPurchase: '75000.0000',
              isActive: true,
              createdAt: now,
            },
            {
              id: `promo-${tId}-2`,
              tenantId: tId,
              name: 'Paket Hemat Buy 2 Get 1',
              promoType: 'BUY_X_GET_Y',
              discountValue: '0.0000',
              minPurchase: '0.0000',
              buyQty: 2,
              getQty: 1,
              isActive: true,
              createdAt: now,
            },
          ]
        : [];

    const crmCustomers: CrmCustomer[] = [
      {
        id: `crm-${tId}-1`,
        tenantId: tId,
        name: vertical === 'FREELANCE' ? 'PT Kopi Maju Bersama' : 'Dimas Pratama (Member VIP)',
        phoneWa: '0812-7766-5544',
        totalSpend: vertical === 'FREELANCE' ? '18500000.0000' : '1450000.0000',
        loyaltyPoints: 185,
        receivableBalance: '0.0000',
        createdAt: now,
      },
    ];

    return {
      ...ws,
      tenant: {
        ...ws.tenant,
        name: renamedTitle,
        subscriptionPlan: 'EXPERT',
        activeAddOns:
          vertical === 'RESTORAN' || vertical === 'KEDAI_MAKAN' ? ['ADDON_RESTO_QR_KDS'] : [],
      },
      accounts: mergedAccounts,
      tables: extraTables,
      branches: [hqBranch],
      branchStocks: ensureBranchStocksForTenant({
        tenantId: tId,
        branches: [hqBranch],
        products: ws.products,
        existingStocks: [],
      }),
      stockTransfers: [],
      suppliers: [],
      stockOpnameSessions: [],
      cashierShifts: [],
      auditLogs: [],
      promotions,
      priceTiers: [],
      crmCustomers,
      orders: ws.orders.map((o) => ({
        ...o,
        branchId: hqBranch.id,
        orderMode: vertical === 'RESTORAN' || vertical === 'KEDAI_MAKAN' ? 'DINE_IN' : 'TAKEAWAY',
      })),
    };
  });
}

/**
 * Demo 5 (KOST_KONTRAKAN): "Kost Griya Nyaman" — 12 Rooms, Active Tenants, Deposit Liability (2106),
 * Monthly Invoices (Paid + Unpaid) with WA Billing & PPh Final Pasal 4(2) 10% Journals.
 */
export function createDemoKostWorkspace(): {
  customer: ManagedCustomerAccount;
  workspace: TenantWorkspaceData;
} {
  const tenantId = 'tenant-kost-griya-nyaman';
  const customerId = 'cust-kost-griya';
  const accounts = makeAccounts(tenantId);
  const now = '2026-11-19T08:00:00.000Z';

  const branch: Branch = {
    id: `${tenantId}-br-hq`,
    tenantId,
    code: 'KST-01',
    name: 'Kost Griya Nyaman — Gedung Utama',
    branchType: 'OUTLET',
    address: 'Jl. Setiabudi Tengah No. 22, Jakarta Selatan',
    phone: '0812-6600-8899',
    nitku22: '3174091102850005000001',
    isDefault: true,
    isActive: true,
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const tenant: Tenant = {
    id: tenantId,
    name: 'Kost Griya Nyaman',
    slug: 'kost-griya-nyaman',
    vertical: 'KOST_KONTRAKAN',
    taxEntity: 'WP_OP',
    isPkp: false,
    npwp16: '3174091102850005',
    nitku22: '3174091102850005000001',
    address: 'Jl. Setiabudi Tengah No. 22, Jakarta Selatan',
    receiptFooter: 'Terima kasih telah menjaga kenyamanan Kost Griya Nyaman!',
    cumulativeTurnoverPriorMonths: '162000000.0000',
    serviceChargeRate: '0',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    subscriptionPlan: 'EXPERT',
    activeAddOns: [],
    accountScope: 'DEMO',
    ownerAccountId: customerId,
    settings: {
      autoPrintQrOrders: false,
      thermalPaperWidth: '58mm',
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const roomSpecs: Array<{ num: string; type: string; rate: string; status: BoardingRoom['status'] }> = [
    { num: '101', type: 'Standar AC + KM Dalam', rate: '1850000.0000', status: 'OCCUPIED' },
    { num: '102', type: 'Standar AC + KM Dalam', rate: '1850000.0000', status: 'OCCUPIED' },
    { num: '103', type: 'Standar AC + KM Dalam', rate: '1850000.0000', status: 'OCCUPIED' },
    { num: '104', type: 'Standar AC + KM Dalam', rate: '1850000.0000', status: 'OCCUPIED' },
    { num: '105', type: 'Standar Non-AC', rate: '1250000.0000', status: 'OCCUPIED' },
    { num: '106', type: 'Standar Non-AC', rate: '1250000.0000', status: 'AVAILABLE' },
    { num: '201', type: 'Deluxe Full Furnished', rate: '2400000.0000', status: 'OCCUPIED' },
    { num: '202', type: 'Deluxe Full Furnished', rate: '2400000.0000', status: 'OCCUPIED' },
    { num: '203', type: 'Deluxe Full Furnished', rate: '2400000.0000', status: 'OCCUPIED' },
    { num: '204', type: 'Deluxe Full Furnished', rate: '2400000.0000', status: 'AVAILABLE' },
    { num: '205', type: 'VIP Studio Balkon', rate: '3200000.0000', status: 'OCCUPIED' },
    { num: '206', type: 'VIP Studio Balkon', rate: '3200000.0000', status: 'MAINTENANCE' },
  ];

  const boardingRooms: BoardingRoom[] = roomSpecs.map((r, i) => {
    const isNonAc = r.type.toLowerCase().includes('non-ac');
    const includedFacilities = isNonAc
      ? ['Air PDAM', 'Listrik', 'Wi-Fi', 'Kasur & Lemari', 'Parkir Motor']
      : ['Air PDAM', 'Listrik', 'Wi-Fi', 'Kasur & Lemari', 'AC', 'Kamar Mandi Dalam', 'Parkir Motor'];
    return {
      id: `room-kst-${r.num}`,
      tenantId,
      branchId: branch.id,
      roomNumber: r.num,
      roomType: r.type,
      monthlyRate: r.rate,
      yearlyRate: String(Number(r.rate) * 11) + '.0000',
      includedFacilities,
      status: r.status,
      notes: r.status === 'MAINTENANCE' ? 'Perbaikan AC & cat ulang dinding' : undefined,
      createdAt: `2026-10-0${(i % 9) + 1}T08:00:00.000Z`,
    };
  });

  const todayDate = new Date();
  const isoOffset = (offsetDays: number) => {
    const d = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const currentPeriodYm = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}`;

  const tenantProfiles: Array<{
    room: string;
    name: string;
    nik: string;
    wa: string;
    dep: string;
    paid: boolean;
    cycle: 'BULANAN' | 'TAHUNAN';
    checkIn: string;
    dueOffsetDays: number;
    addOns?: Array<{ id: string; name: string; monthlyFee: string }>;
  }> = [
    { room: '101', name: 'Nadia Larasati', nik: '3174015506960001', wa: '0812-1010-2001', dep: '1000000.0000', paid: true, cycle: 'BULANAN', checkIn: '2026-09-01', dueOffsetDays: 14 },
    { room: '102', name: 'Reza Mahendra', nik: '3174021208940002', wa: '0812-1010-2002', dep: '1000000.0000', paid: true, cycle: 'BULANAN', checkIn: '2026-08-15', dueOffsetDays: 4 },
    { room: '103', name: 'Ayu Wulandari', nik: '3273016403970003', wa: '0813-1010-2003', dep: '1000000.0000', paid: true, cycle: 'TAHUNAN', checkIn: '2026-06-01', dueOffsetDays: 190 },
    {
      room: '104',
      name: 'Fajar Nugroho',
      nik: '3578010911930004',
      wa: '0815-1010-2004',
      dep: '1000000.0000',
      paid: false,
      cycle: 'BULANAN',
      checkIn: '2026-09-05',
      dueOffsetDays: -3,
      addOns: [{ id: 'addon-104-parkir', name: 'Parkir Mobil', monthlyFee: '150000.0000' }],
    },
    { room: '105', name: 'Bagus Setiawan', nik: '3374011805980005', wa: '0812-1010-2005', dep: '750000.0000', paid: true, cycle: 'BULANAN', checkIn: '2026-10-01', dueOffsetDays: 18 },
    { room: '201', name: 'Clarissa Tan', nik: '3173014809950006', wa: '0811-1010-2006', dep: '1500000.0000', paid: true, cycle: 'TAHUNAN', checkIn: '2026-07-10', dueOffsetDays: 229 },
    {
      room: '202',
      name: 'Kevin Pratama',
      nik: '3171012204920007',
      wa: '0812-1010-2007',
      dep: '1500000.0000',
      paid: true,
      cycle: 'BULANAN',
      checkIn: '2026-09-12',
      dueOffsetDays: 2,
      addOns: [{ id: 'addon-202-laundry', name: 'Laundry Bulanan', monthlyFee: '120000.0000' }],
    },
    { room: '203', name: 'Dina Oktaviani', nik: '3275015110960008', wa: '0813-1010-2008', dep: '1500000.0000', paid: false, cycle: 'BULANAN', checkIn: '2026-09-01', dueOffsetDays: 0 },
    { room: '205', name: 'dr. Hendry Gunawan', nik: '3174011402900009', wa: '0811-1010-2009', dep: '2000000.0000', paid: true, cycle: 'TAHUNAN', checkIn: '2026-05-01', dueOffsetDays: 159 },
  ];

  const boardingTenants: BoardingTenant[] = tenantProfiles.map((tp, i) => {
    const rm = boardingRooms.find((r) => r.roomNumber === tp.room);
    return {
      id: `bten-${tp.room}`,
      tenantId,
      roomId: `room-kst-${tp.room}`,
      fullName: tp.name,
      nikKtp: tp.nik,
      phoneWa: tp.wa,
      emergencyContact: `Keluarga ${tp.name.split(' ')[0]} (0812-9000-000${i + 1})`,
      checkInDate: tp.checkIn,
      billingCycle: tp.cycle,
      nextDueDate: isoOffset(tp.dueOffsetDays),
      depositAmount: tp.dep,
      includedFacilities: rm?.includedFacilities ? [...rm.includedFacilities] : undefined,
      facilityAddOns: tp.addOns ? tp.addOns.map((a) => ({ ...a })) : [],
      isActive: true,
      createdAt: `${tp.checkIn}T08:00:00.000Z`,
    };
  });

  const journalEntries = [
    buildJournalEntry({
      id: `je-open-${tenantId}`,
      tenantId,
      branchId: branch.id,
      entryNumber: 'OPN-20261001-0001',
      entryDate: '2026-10-01',
      sourceModule: 'OPENING',
      sourceId: null,
      description: 'Saldo Awal Kas, Bank & Bangunan Kost Griya Nyaman',
      accounts,
      draftLines: [
        { accountCode: '1101', debit: '12000000.0000', credit: '0' },
        { accountCode: '1102', debit: '68000000.0000', credit: '0' },
        { accountCode: '1201', debit: '450000000.0000', credit: '0' },
        { accountCode: '3101', debit: '0', credit: '530000000.0000' },
      ],
    }),
  ];

  let seq = 2;
  const boardingInvoices: BoardingInvoice[] = [];

  for (const tp of tenantProfiles) {
    const bt = boardingTenants.find((t) => t.id === `bten-${tp.room}`)!;
    const room = boardingRooms.find((r) => r.id === `room-kst-${tp.room}`)!;

    // Deposit MUST be liability 2106
    const depJe = createBoardingDepositJournal({
      tenantId,
      branchId: branch.id,
      boardingTenant: bt,
      roomNumber: room.roomNumber,
      paymentAccountCode: '1102',
      accounts,
      entrySeq: seq++,
      entryDate: '2026-10-02',
    });
    if (depJe) journalEntries.push(depJe);

    const roomMonthlyRate = room.monthlyRate ?? room.monthlyPrice ?? '1500000.0000';
    const roomYearlyRate = room.yearlyRate ?? room.annualPrice ?? String(Number(roomMonthlyRate) * 11) + '.0000';
    const baseRent = tp.cycle === 'TAHUNAN' ? roomYearlyRate : roomMonthlyRate;
    const activeAddOns = bt.facilityAddOns ?? [];
    const addOnSum = activeAddOns.reduce(
      (acc, item) => acc + Number(item.monthlyFee) * (tp.cycle === 'TAHUNAN' ? 12 : 1),
      0
    );
    const utilityFee = `${addOnSum.toFixed(4)}`;
    const lateFee = !tp.paid && tp.dueOffsetDays < 0 ? '50000.0000' : '0.0000';
    const calc = calculateBoardingInvoice({
      rentAmount: baseRent,
      utilityFee,
      lateFee,
    });

    const inv: BoardingInvoice = {
      id: `binv-202611-${tp.room}`,
      tenantId,
      branchId: branch.id,
      roomId: room.id,
      boardingTenantId: bt.id,
      periodMonth: tp.cycle === 'TAHUNAN' ? `TAHUNAN-${todayDate.getFullYear()}-${todayDate.getFullYear() + 1}` : currentPeriodYm,
      billingCycle: tp.cycle,
      dueDate: isoOffset(tp.dueOffsetDays),
      rentAmount: baseRent,
      utilityFee,
      facilityAddOns: activeAddOns.length > 0 ? activeAddOns : undefined,
      lateFee,
      totalAmount: calc.totalAmount,
      pph42Amount: calc.pph42Amount,
      paymentStatus: tp.paid ? 'PAID' : tp.dueOffsetDays < 0 ? 'OVERDUE' : 'UNPAID',
      paidAt: tp.paid ? '2026-11-04T09:30:00.000Z' : null,
      createdAt: '2026-11-01T08:00:00.000Z',
    };
    boardingInvoices.push(inv);

    if (tp.paid) {
      journalEntries.push(
        createBoardingRentPaymentJournal({
          tenantId,
          branchId: branch.id,
          invoice: inv,
          tenantName: bt.fullName,
          roomNumber: room.roomNumber,
          paymentAccountCode: '1102',
          accounts,
          entrySeq: seq++,
          entryDate: '2026-11-04',
        })
      );
    }
  }

  const categories: Category[] = [
    { id: 'cat-kst-1', tenantId, name: 'Sewa Kamar', sortOrder: 1 },
    { id: 'cat-kst-2', tenantId, name: 'Utilitas & Listrik', sortOrder: 2 },
  ];

  const workspace: TenantWorkspaceData = {
    tenant,
    accounts,
    categories,
    taxonomy: buildHierarchicalTaxonomyFromPresets('KOST_KONTRAKAN', categories),
    products: [
      {
        id: 'prod-kst-laundry',
        tenantId,
        categoryId: 'cat-kst-2',
        sku: 'KST-LND',
        barcodeQr: 'KST001',
        name: 'Paket Laundry Bulanan Penghuni',
        description: 'Cuci & setrika maksimal 20 Kg/bulan',
        itemType: 'SERVICE_FREELANCE',
        unit: 'bulan',
        sellingPrice: '150000.0000',
        costPriceAvg: '45000.0000',
        stockQty: '0.0000',
        minStockAlert: '0.0000',
        isLuxuryGoods: false,
        isTaxExempt: true,
        isAvailable: true,
        customAttributes: {},
        createdAt: now,
      },
    ],
    recipes: [],
    inventoryMovements: [],
    purchaseOrders: [],
    tables: [],
    orders: [],
    expenses: [
      {
        id: 'exp-kst-1',
        tenantId,
        branchId: branch.id,
        expenseDate: '2026-11-10',
        expenseAccountId: accounts.find((a) => a.code === '6102')?.id ?? `${tenantId}-acc-6102`,
        expenseAccountCode: '6102',
        paymentAccountId: accounts.find((a) => a.code === '1102')?.id ?? `${tenantId}-acc-1102`,
        paymentAccountCode: '1102',
        description: 'Tagihan Listrik PLN & Internet Biznet Gedung Kost',
        amount: '3450000.0000',
        withholdingTaxType: 'NONE',
        withholdingTaxAmount: '0.0000',
        customAttributes: {},
        createdAt: '2026-11-10T10:00:00.000Z',
      },
    ],
    fixedAssets: [
      {
        id: 'fa-kst-1',
        tenantId,
        assetCode: 'FA-KST-001',
        name: '12 Unit AC Daikin Inverter + Water Heater',
        acquisitionDate: '2026-01-15',
        acquisitionCost: '72000000.0000',
        salvageValue: '6000000.0000',
        usefulLifeMonths: 60,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '11000000.0000',
        assetAccountId: accounts.find((a) => a.code === '1201')!.id,
        accumDeprAccountId: accounts.find((a) => a.code === '1202')!.id,
        deprExpenseAccountId: accounts.find((a) => a.code === '6106')!.id,
        status: 'ACTIVE',
      },
    ],
    customFields: [],
    journalEntries,
    branches: [branch],
    branchStocks: [],
    stockTransfers: [],
    suppliers: [],
    stockOpnameSessions: [],
    boardingRooms,
    boardingTenants,
    boardingInvoices,
    agroBatches: [],
    cashierShifts: [],
    auditLogs: [],
    promotions: [],
    priceTiers: [],
    crmCustomers: [],
  };

  const customer: ManagedCustomerAccount = {
    id: customerId,
    fullName: 'Ibu Dewi Hartono (Demo Kost & Kontrakan)',
    email: 'demo.kost@kasirakun.id',
    passwordDemo: 'Demo2026!',
    phone: '0812-6600-8899',
    role: 'OWNER',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    subscriptionPlan: 'EXPERT',
    activeAddOns: [],
    monthlyRecurringRevenue: '349000.0000',
    maxTenantsAllowed: 3,
    tenantIds: [tenantId],
    primaryTenantId: tenantId,
    accountScope: 'DEMO',
    isDemoAccount: true,
    demoVertical: 'KOST_KONTRAKAN',
    onboardingCompleted: true,
    lastInvoiceNumber: 'SUB-20261101-6005',
    lastPaidAt: '2026-11-01T08:00:00.000Z',
    validUntil: '2026-12-01T08:00:00.000Z',
    adminNotes: 'Demo Kost Griya Nyaman: 12 kamar, deposit kewajiban (2106), tagihan WA & PPh 4(2) 10%.',
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  return { customer, workspace };
}

/**
 * Demo 6 (PETERNAKAN_PERTANIAN): "Agro Ternak Mandiri" — Ayam Broiler Batch #4 & Padi Blok B,
 * Pemakaian Pakan/Pupuk WIP (1109), Panen & Otomatis HPP/Kg ke Persediaan Hasil Panen (1110).
 */
export function createDemoAgroWorkspace(): {
  customer: ManagedCustomerAccount;
  workspace: TenantWorkspaceData;
} {
  const tenantId = 'tenant-agro-ternak-mandiri';
  const customerId = 'cust-agro-mandiri';
  const accounts = makeAccounts(tenantId);
  const now = '2026-11-19T08:00:00.000Z';

  const branch: Branch = {
    id: `${tenantId}-br-hq`,
    tenantId,
    code: 'AGR-01',
    name: 'Farm & Lahan Agro Mandiri',
    branchType: 'OUTLET',
    address: 'Jl. Raya Subang KM 14, Jawa Barat',
    phone: '0813-9900-4455',
    nitku22: '3213012004870006000001',
    isDefault: true,
    isActive: true,
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const tenant: Tenant = {
    id: tenantId,
    name: 'Agro Ternak Mandiri',
    slug: 'agro-ternak-mandiri',
    vertical: 'PETERNAKAN_PERTANIAN',
    taxEntity: 'WP_OP',
    isPkp: false,
    npwp16: '3213012004870006',
    nitku22: '3213012004870006000001',
    address: 'Jl. Raya Subang KM 14, Jawa Barat',
    receiptFooter: 'Hasil panen segar langsung dari peternakan & lahan Agro Ternak Mandiri!',
    cumulativeTurnoverPriorMonths: '215000000.0000',
    serviceChargeRate: '0',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    subscriptionPlan: 'EXPERT',
    activeAddOns: [],
    accountScope: 'DEMO',
    ownerAccountId: customerId,
    settings: {
      autoPrintQrOrders: false,
      thermalPaperWidth: '58mm',
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const categories: Category[] = [
    { id: 'cat-agr-panen', tenantId, name: 'Hasil Panen', sortOrder: 1 },
    { id: 'cat-agr-pakan', tenantId, name: 'Pakan Ternak', sortOrder: 2 },
    { id: 'cat-agr-pupuk', tenantId, name: 'Pupuk & Nutrisi', sortOrder: 3 },
  ];

  const prodPakan: Product = {
    id: 'prod-agr-pakan',
    tenantId,
    categoryId: 'cat-agr-pakan',
    sku: 'PKN-CP511',
    barcodeQr: 'AGR-PKN-01',
    name: 'Pakan Broiler Pokphand CP-511 (50 Kg)',
    description: 'Pakan starter & finisher broiler kualitas tinggi',
    itemType: 'RAW_MATERIAL',
    unit: 'sak',
    sellingPrice: '0.0000',
    costPriceAvg: '410000.0000',
    stockQty: '45.0000',
    minStockAlert: '15.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: false,
    customAttributes: {},
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const prodPupuk: Product = {
    id: 'prod-agr-pupuk',
    tenantId,
    categoryId: 'cat-agr-pupuk',
    sku: 'PPK-NPK50',
    barcodeQr: 'AGR-PPK-01',
    name: 'Pupuk NPK Phonska (50 Kg)',
    description: 'Pupuk majemuk untuk lahan padi sawah',
    itemType: 'RAW_MATERIAL',
    unit: 'karung',
    sellingPrice: '0.0000',
    costPriceAvg: '285000.0000',
    stockQty: '30.0000',
    minStockAlert: '10.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: false,
    customAttributes: {},
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  let prodAyamPanen: Product = {
    id: 'prod-agr-ayam',
    tenantId,
    categoryId: 'cat-agr-panen',
    sku: 'HSL-BRL-KG',
    barcodeQr: '899770011001',
    name: 'Ayam Broiler Hidup Grade A',
    description: 'Hasil panen kandang sehat bobot 1.8–2.1 kg/ekor',
    itemType: 'RETAIL_GOODS',
    unit: 'kg',
    sellingPrice: '27500.0000',
    costPriceAvg: '19800.0000',
    stockQty: '120.0000',
    minStockAlert: '50.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const prodGabah: Product = {
    id: 'prod-agr-gabah',
    tenantId,
    categoryId: 'cat-agr-panen',
    sku: 'HSL-GKP-KG',
    barcodeQr: '899770011002',
    name: 'Gabah Kering Panen (IR64)',
    description: 'Gabah sawah Blok B kadar air standar penggilingan',
    itemType: 'RETAIL_GOODS',
    unit: 'kg',
    sellingPrice: '7200.0000',
    costPriceAvg: '4500.0000',
    stockQty: '1200.0000',
    minStockAlert: '200.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const journalEntries = [
    buildJournalEntry({
      id: `je-open-${tenantId}`,
      tenantId,
      branchId: branch.id,
      entryNumber: 'OPN-20261001-0001',
      entryDate: '2026-10-01',
      sourceModule: 'OPENING',
      sourceId: null,
      description: 'Saldo Awal Kas, Persediaan Pakan/Pupuk & Modal Agro Ternak Mandiri',
      accounts,
      draftLines: [
        { accountCode: '1101', debit: '25000000.0000', credit: '0' },
        { accountCode: '1102', debit: '85000000.0000', credit: '0' },
        { accountCode: '1105', debit: '65000000.0000', credit: '0' },
        { accountCode: '3101', debit: '0', credit: '175000000.0000' },
      ],
    }),
  ];

  // Batch 1 (HARVESTED): Ayam Broiler Batch #3 -> demonstrates completed Harvest & exact HPP/Kg
  let batch3: AgroBatch = {
    id: 'agro-batch-3',
    tenantId,
    branchId: branch.id,
    name: 'Ayam Broiler Batch #3 (Kandang A)',
    agroType: 'TERNAK',
    startDate: '2026-10-05',
    initialQty: '1000.0000',
    mortalityQty: '35.0000',
    unit: 'ekor',
    status: 'ACTIVE',
    accumulatedCost: '0.0000',
    usages: [],
    harvests: [],
    createdAt: '2026-10-05T07:00:00.000Z',
  };

  const u3a = recordAgroBatchUsage({
    tenantId,
    branchId: branch.id,
    batch: batch3,
    usageCategory: 'BIBIT',
    description: 'DOC Ayam Broiler Grade A (1.000 ekor)',
    qtyUsed: '1000',
    unit: 'ekor',
    unitCost: '7500',
    usageDate: '2026-10-05',
    accounts,
    entrySeq: 2,
  });
  batch3 = u3a.updatedBatch;
  journalEntries.push(u3a.journalEntry);

  const u3b = recordAgroBatchUsage({
    tenantId,
    branchId: branch.id,
    batch: batch3,
    usageCategory: 'PAKAN',
    productId: prodPakan.id,
    description: 'Pakan Broiler Pokphand CP-511 (55 sak)',
    qtyUsed: '55',
    unit: 'sak',
    unitCost: '410000',
    usageDate: '2026-10-20',
    accounts,
    entrySeq: 3,
  });
  batch3 = u3b.updatedBatch;
  journalEntries.push(u3b.journalEntry);

  const u3c = recordAgroBatchUsage({
    tenantId,
    branchId: branch.id,
    batch: batch3,
    usageCategory: 'TENAGA_KERJA',
    description: 'Upah Anak Kandang & Vitamin Siklus #3',
    qtyUsed: '1',
    unit: 'paket',
    unitCost: '3450000',
    usageDate: '2026-11-01',
    accounts,
    entrySeq: 4,
  });
  batch3 = u3c.updatedBatch;
  journalEntries.push(u3c.journalEntry);

  const harvest3 = recordAgroHarvest({
    tenantId,
    branchId: branch.id,
    batch: batch3,
    targetProduct: prodAyamPanen,
    netHarvestQty: '1750',
    unit: 'kg',
    harvestDate: '2026-11-10',
    accounts,
    entrySeq: 5,
  });
  batch3 = harvest3.updatedBatch;
  prodAyamPanen = harvest3.updatedProduct;
  journalEntries.push(harvest3.journalEntry);

  // Batch 2 (ACTIVE): Ayam Broiler Batch #4 (in progress)
  let batch4: AgroBatch = {
    id: 'agro-batch-4',
    tenantId,
    branchId: branch.id,
    name: 'Ayam Broiler Batch #4 (Kandang B)',
    agroType: 'TERNAK',
    startDate: '2026-11-05',
    initialQty: '1200.0000',
    mortalityQty: '18.0000',
    unit: 'ekor',
    status: 'ACTIVE',
    accumulatedCost: '0.0000',
    usages: [],
    harvests: [],
    createdAt: '2026-11-05T07:00:00.000Z',
  };

  const u4a = recordAgroBatchUsage({
    tenantId,
    branchId: branch.id,
    batch: batch4,
    usageCategory: 'BIBIT',
    description: 'DOC Ayam Broiler Grade A (1.200 ekor)',
    qtyUsed: '1200',
    unit: 'ekor',
    unitCost: '7600',
    usageDate: '2026-11-05',
    accounts,
    entrySeq: 6,
  });
  batch4 = u4a.updatedBatch;
  journalEntries.push(u4a.journalEntry);

  const u4b = recordAgroBatchUsage({
    tenantId,
    branchId: branch.id,
    batch: batch4,
    usageCategory: 'PAKAN',
    productId: prodPakan.id,
    description: 'Pakan Starter CP-511 (30 sak)',
    qtyUsed: '30',
    unit: 'sak',
    unitCost: '410000',
    usageDate: '2026-11-15',
    accounts,
    entrySeq: 7,
  });
  batch4 = u4b.updatedBatch;
  journalEntries.push(u4b.journalEntry);

  // Batch 3 (ACTIVE): Padi Blok B (TANAMAN)
  let batchPadi: AgroBatch = {
    id: 'agro-batch-padi-b',
    tenantId,
    branchId: branch.id,
    name: 'Padi IR64 Blok B (2 Hektar)',
    agroType: 'TANAMAN',
    startDate: '2026-10-18',
    initialQty: '2.0000',
    mortalityQty: '0.0000',
    unit: 'hektar',
    status: 'ACTIVE',
    accumulatedCost: '0.0000',
    usages: [],
    harvests: [],
    createdAt: '2026-10-18T07:00:00.000Z',
  };

  const up1 = recordAgroBatchUsage({
    tenantId,
    branchId: branch.id,
    batch: batchPadi,
    usageCategory: 'PUPUK',
    productId: prodPupuk.id,
    description: 'Pupuk NPK Phonska Tabur Tahap 1 (20 karung)',
    qtyUsed: '20',
    unit: 'karung',
    unitCost: '285000',
    usageDate: '2026-11-02',
    accounts,
    entrySeq: 8,
  });
  batchPadi = up1.updatedBatch;
  journalEntries.push(up1.journalEntry);

  const products = [prodAyamPanen, prodGabah, prodPakan, prodPupuk];
  const branchStocks = ensureBranchStocksForTenant({
    tenantId,
    branches: [branch],
    products,
    existingStocks: [],
  });

  const workspace: TenantWorkspaceData = {
    tenant,
    accounts,
    categories,
    taxonomy: buildHierarchicalTaxonomyFromPresets('PETERNAKAN_PERTANIAN', categories),
    products,
    recipes: [],
    inventoryMovements: [],
    purchaseOrders: [],
    tables: [],
    orders: [],
    expenses: [],
    fixedAssets: [],
    customFields: [],
    journalEntries,
    branches: [branch],
    branchStocks,
    stockTransfers: [],
    suppliers: [
      {
        id: 'sup-agr-1',
        tenantId,
        name: 'PT Charoen Pokphand Indonesia (Pakan & DOC)',
        phone: '0260-441122',
        address: 'Subang, Jawa Barat',
        defaultTermDays: 14,
        createdAt: now,
      },
    ],
    stockOpnameSessions: [],
    boardingRooms: [],
    boardingTenants: [],
    boardingInvoices: [],
    agroBatches: [batch4, batchPadi, batch3],
    cashierShifts: [],
    auditLogs: [],
    promotions: [],
    priceTiers: [],
    crmCustomers: [],
  };

  const customer: ManagedCustomerAccount = {
    id: customerId,
    fullName: 'Pak Slamet Raharjo (Demo Peternakan & Pertanian)',
    email: 'demo.agro@kasirakun.id',
    passwordDemo: 'Demo2026!',
    phone: '0813-9900-4455',
    role: 'OWNER',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    subscriptionPlan: 'EXPERT',
    activeAddOns: [],
    monthlyRecurringRevenue: '349000.0000',
    maxTenantsAllowed: 3,
    tenantIds: [tenantId],
    primaryTenantId: tenantId,
    accountScope: 'DEMO',
    isDemoAccount: true,
    demoVertical: 'PETERNAKAN_PERTANIAN',
    onboardingCompleted: true,
    lastInvoiceNumber: 'SUB-20261101-6006',
    lastPaidAt: '2026-11-01T08:00:00.000Z',
    validUntil: '2026-12-01T08:00:00.000Z',
    adminNotes: 'Demo Agro Ternak Mandiri: Ayam Broiler Batch #4, Padi Blok B, Aset Biologis WIP (1109) & HPP Panen otomatis (1110).',
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  return { customer, workspace };
}

/**
 * Demo 7 (BARBERSHOP_SALON): "Gentleman Cuts & Salon" — Haircut/Treatment Services, Stylist Commission Tracking,
 * Retail Haircare Stock (Pomade/Serum), Multi-Payment (QRIS/GoPay/OVO) & PPh Final UMKM 0.5% (WP OP).
 */
export function createDemoBarbershopWorkspace(): {
  customer: ManagedCustomerAccount;
  workspace: TenantWorkspaceData;
} {
  const tenantId = 'tenant-barbershop-gentleman';
  const customerId = 'cust-barbershop-gentleman';
  const accounts = makeAccounts(tenantId);
  const now = '2026-11-19T08:00:00.000Z';

  const branch: Branch = {
    id: `${tenantId}-br-hq`,
    tenantId,
    code: 'BRB-01',
    name: 'Gentleman Cuts & Salon — Kemang',
    branchType: 'OUTLET',
    address: 'Jl. Kemang Raya No. 45, Jakarta Selatan',
    phone: '0812-8899-7711',
    nitku22: '3174081205910007000001',
    isDefault: true,
    isActive: true,
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const tenant: Tenant = {
    id: tenantId,
    name: 'Gentleman Cuts & Salon',
    slug: 'gentleman-cuts-salon',
    vertical: 'BARBERSHOP_SALON',
    taxEntity: 'WP_OP',
    isPkp: false,
    npwp16: '3174081205910007',
    nitku22: '3174081205910007000001',
    address: 'Jl. Kemang Raya No. 45, Jakarta Selatan',
    receiptFooter: 'Terima kasih telah merawat gaya rambut Anda di Gentleman Cuts & Salon!',
    cumulativeTurnoverPriorMonths: '145000000.0000',
    serviceChargeRate: '0',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    subscriptionPlan: 'EXPERT',
    activeAddOns: [],
    accountScope: 'DEMO',
    ownerAccountId: customerId,
    settings: {
      autoPrintQrOrders: false,
      thermalPaperWidth: '58mm',
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const categories: Category[] = [
    { id: 'cat-brb-svc', tenantId, name: 'Layanan Potong & Styling', sortOrder: 1 },
    { id: 'cat-brb-care', tenantId, name: 'Perawatan Rambut & Creambath', sortOrder: 2 },
    { id: 'cat-brb-ret', tenantId, name: 'Produk Retail Haircare', sortOrder: 3 },
  ];

  const products: Product[] = [
    {
      id: 'prod-brb-cut',
      tenantId,
      categoryId: 'cat-brb-svc',
      sku: 'SVC-CUT-01',
      barcodeQr: 'BRB001',
      name: 'Gentleman Haircut + Cuci + Pijat',
      description: 'Potong rambut presisi, cuci rambut dengan tonic & pijat relaksasi 35 menit',
      itemType: 'SERVICE_FREELANCE',
      unit: 'sesi',
      sellingPrice: '65000.0000',
      costPriceAvg: '0.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-brb-beard',
      tenantId,
      categoryId: 'cat-brb-svc',
      sku: 'SVC-BRD-02',
      barcodeQr: 'BRB002',
      name: 'Hot Towel Shaving & Beard Trim',
      description: 'Cukur jenggot rapi dengan handuk hangat & aftershave soothing balm',
      itemType: 'SERVICE_FREELANCE',
      unit: 'sesi',
      sellingPrice: '45000.0000',
      costPriceAvg: '0.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-brb-cream',
      tenantId,
      categoryId: 'cat-brb-care',
      sku: 'SVC-CRM-03',
      barcodeQr: 'BRB003',
      name: 'Creambath Ginseng + Hair Spa',
      description: 'Nutrisi akar rambut ginseng, steam uap hangat & blow styling',
      itemType: 'SERVICE_FREELANCE',
      unit: 'sesi',
      sellingPrice: '95000.0000',
      costPriceAvg: '0.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-brb-color',
      tenantId,
      categoryId: 'cat-brb-care',
      sku: 'SVC-CLR-04',
      barcodeQr: 'BRB004',
      name: 'Hair Coloring Fashion / Natural Black',
      description: 'Pewarnaan rambut premium bebas amonia + vitamin pelindung warna',
      itemType: 'SERVICE_FREELANCE',
      unit: 'sesi',
      sellingPrice: '185000.0000',
      costPriceAvg: '0.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-brb-pomade',
      tenantId,
      categoryId: 'cat-brb-ret',
      sku: 'RET-PMD-01',
      barcodeQr: '899550011001',
      name: 'Waterbased Pomade Chief Barber 100g',
      description: 'Strong hold medium shine, mudah dibilas dengan air',
      itemType: 'RETAIL_GOODS',
      unit: 'jar',
      sellingPrice: '135000.0000',
      costPriceAvg: '82000.0000',
      stockQty: '24.0000',
      minStockAlert: '6.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-brb-serum',
      tenantId,
      categoryId: 'cat-brb-ret',
      sku: 'RET-SRM-02',
      barcodeQr: '899550011002',
      name: 'Hair Tonic & Anti-Hairfall Serum 150ml',
      description: 'Menyegarkan kulit kepala dan mengurangi kerontokan rambut',
      itemType: 'RETAIL_GOODS',
      unit: 'botol',
      sellingPrice: '98000.0000',
      costPriceAvg: '58000.0000',
      stockQty: '18.0000',
      minStockAlert: '5.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
  ];

  const openingJe = buildJournalEntry({
    id: `je-open-${tenantId}`,
    tenantId,
    branchId: branch.id,
    entryNumber: 'OPN-20261001-0001',
    entryDate: '2026-10-01',
    sourceModule: 'OPENING',
    sourceId: null,
    description: 'Saldo Awal Kas, Bank, Persediaan Haircare & Peralatan Salon',
    accounts,
    draftLines: [
      { accountCode: '1101', debit: '8500000.0000', credit: '0' },
      { accountCode: '1102', debit: '32000000.0000', credit: '0' },
      { accountCode: '1105', debit: '6500000.0000', credit: '0' },
      { accountCode: '1201', debit: '45000000.0000', credit: '0' },
      { accountCode: '3101', debit: '0', credit: '92000000.0000' },
    ],
  });

  const sale1 = processOrderCheckout({
    tenant,
    products,
    recipes: [],
    accounts,
    cart: [
      { productId: 'prod-brb-cut', qty: 1 },
      { productId: 'prod-brb-pomade', qty: 1 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'QRIS_DYNAMIC',
    customerName: 'Andi Saputra',
    stylistName: 'Raka (Senior Barber)',
    stylistCommissionRate: '0.30',
    journalSeqStart: 2,
  });

  const sale2 = processOrderCheckout({
    tenant,
    products: sale1.updatedProducts,
    recipes: [],
    accounts,
    cart: [
      { productId: 'prod-brb-cream', qty: 1 },
      { productId: 'prod-brb-color', qty: 1 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'EWALLET_GOPAY',
    customerName: 'Nadia Putri',
    stylistName: 'Dina (Hair Stylist)',
    stylistCommissionRate: '0.25',
    journalSeqStart: 4,
  });

  const workspace: TenantWorkspaceData = {
    tenant,
    accounts,
    categories,
    taxonomy: buildHierarchicalTaxonomyFromPresets('BARBERSHOP_SALON', categories),
    products: sale2.updatedProducts,
    recipes: [],
    inventoryMovements: [...sale1.newInventoryMovements, ...sale2.newInventoryMovements],
    purchaseOrders: [],
    tables: [],
    orders: [
      { ...sale2.order, branchId: branch.id },
      { ...sale1.order, branchId: branch.id },
    ],
    expenses: [],
    fixedAssets: [
      {
        id: 'fa-brb-1',
        tenantId,
        assetCode: 'FA-BRB-001',
        name: '4 Unit Kursi Barber Hidrolik Takara & Hair Steamer',
        acquisitionDate: '2026-02-01',
        acquisitionCost: '45000000.0000',
        salvageValue: '5000000.0000',
        usefulLifeMonths: 60,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '6000000.0000',
        assetAccountId: accounts.find((a) => a.code === '1201')!.id,
        accumDeprAccountId: accounts.find((a) => a.code === '1202')!.id,
        deprExpenseAccountId: accounts.find((a) => a.code === '6106')!.id,
        status: 'ACTIVE',
      },
    ],
    customFields: [],
    journalEntries: [openingJe, ...sale1.newJournalEntries, ...sale2.newJournalEntries],
    branches: [branch],
    branchStocks: ensureBranchStocksForTenant({
      tenantId,
      branches: [branch],
      products: sale2.updatedProducts,
      existingStocks: [],
    }),
    stockTransfers: [],
    suppliers: [
      {
        id: 'sup-brb-1',
        tenantId,
        name: 'PT Grooming Supply Indonesia',
        phone: '0812-7700-1122',
        address: 'Jakarta Barat',
        defaultTermDays: 14,
        createdAt: now,
      },
    ],
    stockOpnameSessions: [],
    boardingRooms: [],
    boardingTenants: [],
    boardingInvoices: [],
    agroBatches: [],
    cashierShifts: [],
    auditLogs: [],
    promotions: [
      {
        id: 'promo-brb-1',
        tenantId,
        name: 'Diskon Paket Grooming 10% (Min Rp150rb)',
        promoType: 'PERCENT',
        discountValue: '10.0000',
        minPurchase: '150000.0000',
        isActive: true,
        createdAt: now,
      },
    ],
    priceTiers: [],
    crmCustomers: [
      {
        id: 'crm-brb-1',
        tenantId,
        name: 'Andi Saputra (Member Barber)',
        phoneWa: '0812-9911-2233',
        totalSpend: '920000.0000',
        loyaltyPoints: 92,
        receivableBalance: '0.0000',
        notes: 'Langganan potong rambut tiap 3 minggu — kapster Raka',
        createdAt: now,
      },
    ],
  };

  const customer: ManagedCustomerAccount = {
    id: customerId,
    fullName: 'Reno Pratama (Demo Barbershop & Salon)',
    email: 'demo.salon@kasirakun.id',
    passwordDemo: 'Demo2026!',
    phone: '0812-8899-7711',
    role: 'OWNER',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    subscriptionPlan: 'EXPERT',
    activeAddOns: [],
    monthlyRecurringRevenue: '349000.0000',
    maxTenantsAllowed: 3,
    tenantIds: [tenantId],
    primaryTenantId: tenantId,
    accountScope: 'DEMO',
    isDemoAccount: true,
    demoVertical: 'BARBERSHOP_SALON',
    onboardingCompleted: true,
    lastInvoiceNumber: 'SUB-20261101-6007',
    lastPaidAt: '2026-11-01T08:00:00.000Z',
    validUntil: '2026-12-01T08:00:00.000Z',
    adminNotes: 'Demo Gentleman Cuts & Salon: Layanan potong/perawatan, komisi kapster otomatis, stok pomade/serum & multi-payment.',
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  return { customer, workspace };
}

/**
 * Demo 8 (TOKO_RETAIL): "Boutique & Retail Sentosa" — 2 Outlets, Barcode/SKU Fashion & Gadget Accessories,
 * Wholesale Price Tiers, Multi-Payment (VA, OVO, DANA, QRIS), Moving Average HPP & PPh Final UMKM.
 */
export function createDemoTokoRetailWorkspace(): {
  customer: ManagedCustomerAccount;
  workspace: TenantWorkspaceData;
} {
  const tenantId = 'tenant-retail-sentosa';
  const customerId = 'cust-retail-sentosa';
  const accounts = makeAccounts(tenantId);
  const now = '2026-11-19T08:00:00.000Z';

  const branches: Branch[] = [
    {
      id: `${tenantId}-br-pusat`,
      tenantId,
      code: 'RTL-01',
      name: 'Boutique Sentosa — Mall Grand Outlet',
      branchType: 'OUTLET',
      address: 'Jl. Braga No. 88, Bandung',
      phone: '0813-2200-8811',
      nitku22: '3273011806900008000001',
      isDefault: true,
      isActive: true,
      createdAt: '2026-10-01T08:00:00.000Z',
    },
    {
      id: `${tenantId}-br-gdg`,
      tenantId,
      code: 'GDG-RTL',
      name: 'Gudang Distribusi Retail Sentosa',
      branchType: 'CENTRAL_WAREHOUSE',
      address: 'Jl. Soekarno Hatta No. 210, Bandung',
      phone: '0813-2200-8812',
      nitku22: '3273011806900008000002',
      isDefault: false,
      isActive: true,
      createdAt: '2026-10-01T08:00:00.000Z',
    },
  ];

  const tenant: Tenant = {
    id: tenantId,
    name: 'Boutique & Retail Sentosa',
    slug: 'boutique-retail-sentosa',
    vertical: 'TOKO_RETAIL',
    taxEntity: 'PT_PERORANGAN',
    isPkp: false,
    npwp16: '3273011806900008',
    nitku22: '3273011806900008000001',
    address: 'Jl. Braga No. 88, Bandung',
    receiptFooter: 'Barang yang sudah dibeli dapat ditukar maks 3 hari dengan struk asli.',
    cumulativeTurnoverPriorMonths: '380000000.0000',
    serviceChargeRate: '0',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX', 'MULTI_BRANCH'],
    subscriptionPlan: 'EXPERT',
    activeAddOns: ['ADDON_EXTRA_BRANCH'],
    accountScope: 'DEMO',
    ownerAccountId: customerId,
    settings: {
      autoPrintQrOrders: false,
      thermalPaperWidth: '58mm',
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  const categories: Category[] = [
    { id: 'cat-rtl-fsh', tenantId, name: 'Fashion & Pakaian', sortOrder: 1 },
    { id: 'cat-rtl-acc', tenantId, name: 'Aksesoris & Tas', sortOrder: 2 },
    { id: 'cat-rtl-elc', tenantId, name: 'Elektronik & Gadget', sortOrder: 3 },
  ];

  const products: Product[] = [
    {
      id: 'prod-rtl-kemeja',
      tenantId,
      categoryId: 'cat-rtl-fsh',
      sku: 'FSH-KMJ-L',
      barcodeQr: '899660022001',
      name: 'Kemeja Linen Premium Sentosa (Size L)',
      description: 'Kemeja katun linen breathable cocok kasual maupun kerja',
      itemType: 'RETAIL_GOODS',
      unit: 'pcs',
      secondaryUnit: 'lusin',
      secondaryUnitRatio: '12',
      sellingPrice: '189000.0000',
      costPriceAvg: '105000.0000',
      stockQty: '42.0000',
      minStockAlert: '10.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-rtl-kaos',
      tenantId,
      categoryId: 'cat-rtl-fsh',
      sku: 'FSH-KOS-M',
      barcodeQr: '899660022002',
      name: 'Kaos Heavyweight Cotton 24s (Size M)',
      description: 'Kaos basic 100% combed cotton premium anti-kusut',
      itemType: 'RETAIL_GOODS',
      unit: 'pcs',
      secondaryUnit: 'lusin',
      secondaryUnitRatio: '12',
      sellingPrice: '99000.0000',
      costPriceAvg: '52000.0000',
      stockQty: '68.0000',
      minStockAlert: '15.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-rtl-tas',
      tenantId,
      categoryId: 'cat-rtl-acc',
      sku: 'ACC-TAS-01',
      barcodeQr: '899660022003',
      name: 'Slingbag Kanvas Water-Repellent',
      description: 'Tas selempang anti cipratan air dengan kompartemen tablet 11 inci',
      itemType: 'RETAIL_GOODS',
      unit: 'pcs',
      sellingPrice: '215000.0000',
      costPriceAvg: '122000.0000',
      stockQty: '25.0000',
      minStockAlert: '6.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-rtl-charger',
      tenantId,
      categoryId: 'cat-rtl-elc',
      sku: 'ELC-CHG-65W',
      barcodeQr: '899660022004',
      name: 'Fast Charger GaN 65W Type-C Dual Port',
      description: 'Adaptor fast charging laptop & smartphone bergaransi resmi 12 bulan',
      itemType: 'RETAIL_GOODS',
      unit: 'pcs',
      sellingPrice: '249000.0000',
      costPriceAvg: '155000.0000',
      stockQty: '19.0000',
      minStockAlert: '5.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
  ];

  const openingJe = buildJournalEntry({
    id: `je-open-${tenantId}`,
    tenantId,
    branchId: branches[0].id,
    entryNumber: 'OPN-20261001-0001',
    entryDate: '2026-10-01',
    sourceModule: 'OPENING',
    sourceId: null,
    description: 'Saldo Awal Kas, Bank & Persediaan Boutique & Retail Sentosa',
    accounts,
    draftLines: [
      { accountCode: '1101', debit: '15000000.0000', credit: '0' },
      { accountCode: '1102', debit: '65000000.0000', credit: '0' },
      { accountCode: '1105', debit: '42000000.0000', credit: '0' },
      { accountCode: '3101', debit: '0', credit: '122000000.0000' },
    ],
  });

  const sale1 = processOrderCheckout({
    tenant,
    products,
    recipes: [],
    accounts,
    cart: [
      { productId: 'prod-rtl-kemeja', qty: 2 },
      { productId: 'prod-rtl-tas', qty: 1 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'VIRTUAL_ACCOUNT',
    customerName: 'Bapak Hendra',
    journalSeqStart: 2,
  });

  const sale2 = processOrderCheckout({
    tenant,
    products: sale1.updatedProducts,
    recipes: [],
    accounts,
    cart: [
      { productId: 'prod-rtl-kaos', qty: 3 },
      { productId: 'prod-rtl-charger', qty: 1 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'EWALLET_OVO',
    customerName: 'Siska Melati',
    journalSeqStart: 4,
  });

  const workspace: TenantWorkspaceData = {
    tenant,
    accounts,
    categories,
    taxonomy: buildHierarchicalTaxonomyFromPresets('TOKO_RETAIL', categories),
    products: sale2.updatedProducts,
    recipes: [],
    inventoryMovements: [...sale1.newInventoryMovements, ...sale2.newInventoryMovements],
    purchaseOrders: [],
    tables: [],
    orders: [
      { ...sale2.order, branchId: branches[0].id },
      { ...sale1.order, branchId: branches[0].id },
    ],
    expenses: [],
    fixedAssets: [],
    customFields: [],
    journalEntries: [openingJe, ...sale1.newJournalEntries, ...sale2.newJournalEntries],
    branches,
    branchStocks: ensureBranchStocksForTenant({
      tenantId,
      branches,
      products: sale2.updatedProducts,
      existingStocks: [],
    }),
    stockTransfers: [],
    suppliers: [
      {
        id: 'sup-rtl-1',
        tenantId,
        name: 'CV Tekstil & Konveksi Bandung Raya',
        phone: '022-7788-9900',
        address: 'Cimahi, Jawa Barat',
        defaultTermDays: 14,
        createdAt: now,
      },
    ],
    stockOpnameSessions: [],
    boardingRooms: [],
    boardingTenants: [],
    boardingInvoices: [],
    agroBatches: [],
    cashierShifts: [],
    auditLogs: [],
    promotions: [
      {
        id: 'promo-rtl-1',
        tenantId,
        name: 'Promo Bundle Fashion Diskon 10% (Min Rp300rb)',
        promoType: 'PERCENT',
        discountValue: '10.0000',
        minPurchase: '300000.0000',
        isActive: true,
        createdAt: now,
      },
    ],
    priceTiers: [
      {
        id: 'pt-rtl-1',
        tenantId,
        productId: 'prod-rtl-kaos',
        minQty: '6.0000',
        tierPrice: '85000.0000',
        label: 'Reseller 6+ pcs',
      },
    ],
    crmCustomers: [
      {
        id: 'crm-rtl-1',
        tenantId,
        name: 'Reseller Maya Boutique',
        phoneWa: '0813-5500-7711',
        totalSpend: '4850000.0000',
        loyaltyPoints: 485,
        receivableBalance: '0.0000',
        createdAt: now,
      },
    ],
  };

  const customer: ManagedCustomerAccount = {
    id: customerId,
    fullName: 'Citra Lestari (Demo Toko Retail)',
    email: 'demo.retail@kasirakun.id',
    passwordDemo: 'Demo2026!',
    phone: '0813-2200-8811',
    role: 'OWNER',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX', 'MULTI_BRANCH'],
    subscriptionPlan: 'EXPERT',
    activeAddOns: ['ADDON_EXTRA_BRANCH'],
    monthlyRecurringRevenue: '409000.0000',
    maxTenantsAllowed: 5,
    tenantIds: [tenantId],
    primaryTenantId: tenantId,
    accountScope: 'DEMO',
    isDemoAccount: true,
    demoVertical: 'TOKO_RETAIL',
    onboardingCompleted: true,
    lastInvoiceNumber: 'SUB-20261101-6008',
    lastPaidAt: '2026-11-01T08:00:00.000Z',
    validUntil: '2026-12-01T08:00:00.000Z',
    adminNotes: 'Demo Boutique & Retail Sentosa: 2 lokasi, SKU barcode, harga grosir reseller, multi-payment VA/OVO & HPP Moving Average.',
    createdAt: '2026-10-01T08:00:00.000Z',
  };

  return { customer, workspace };
}

