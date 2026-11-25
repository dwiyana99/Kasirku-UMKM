/**
 * KasirAkun UMKM — Complete Prisma Seed Script
 * Populates:
 * 1. All 5 Default Modular Subscription Feature Modules
 * 2. Base 28-Account SAK EMKM / PSAK Chart of Accounts (CoA)
 * 3. Master SaaS Owner account + Sample Demo Customer account
 * 4. Sample UMKM Tenant, Membership, Subscriptions, Categories, Products & QR Tables
 *
 * Compatible with PostgreSQL / Prisma Client (`npx prisma db seed`).
 */

export const DEFAULT_FEATURE_MODULES = [
  {
    code: 'POS_BASIC',
    name: 'POS Kasir & Struk Thermal',
    description: 'Kasir multi-pembayaran, barcode scanner, cetak struk 58mm/80mm, dan laporan omzet harian.',
    monthlyPrice: '0.0000',
    isCore: true,
  },
  {
    code: 'QR_TABLE_KITCHEN',
    name: 'QR Table Self-Order & Kitchen Display',
    description: 'Pemesanan mandiri via QR meja, verifikasi Dynamic QRIS otomatis, dan layar dapur real-time.',
    monthlyPrice: '79000.0000',
    isCore: false,
  },
  {
    code: 'ACCOUNTING_FULL',
    name: 'Akuntansi Double-Entry & HPP Otomatis',
    description: 'Jurnal otomatis perpetual (Moving Average & BOM Resep), aset tetap, penyusutan, dan laporan 3-Tier SAK EMKM/PSAK.',
    monthlyPrice: '99000.0000',
    isCore: false,
  },
  {
    code: 'TAX_CORETAX',
    name: 'Pajak DJP & Kesiapan Coretax',
    description: 'Monitor omzet bebas pajak Rp500 Juta (PP 20/2026), PPN DPP Nilai Lain 11/12 (PMK 131/2024), PB1 10%, dan PPh 21/23/4(2).',
    monthlyPrice: '49000.0000',
    isCore: false,
  },
  {
    code: 'MULTI_BRANCH',
    name: 'Multi-UMKM & Multi-Cabang (NITKU)',
    description: 'Kelola lintas usaha (Warung, Restoran, Freelance) dalam satu akun dengan pemetaan NITKU 22-digit.',
    monthlyPrice: '39000.0000',
    isCore: false,
  },
  {
    code: 'ADDON_LANDING_PAGE',
    name: 'Landing Page Usaha & Katalog Online',
    description: 'Halaman website profil usaha & katalog online publik (/toko/nama-usaha, siap migrasi subdomain), adaptif sesuai jenis UMKM, termasuk bantuan kustomisasi awal gratis oleh Master Admin.',
    monthlyPrice: '25000.0000',
    isCore: false,
  },
] as const;

export const DEFAULT_CHART_OF_ACCOUNTS = [
  // 1xxx — ASET (ASSETS)
  { code: '1101', name: 'Kas Tunai Operasional', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1102', name: 'Bank Operasional (BCA/Mandiri)', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1103', name: 'Piutang QRIS & Payment Gateway', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1104', name: 'Piutang Usaha / Klien', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1105', name: 'Persediaan Barang Dagang / Bahan Baku', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1106', name: 'PPN Masukan (Pajak Dibayar Dimuka)', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1107', name: 'Kredit Pajak PPh 23 / 21 Dipotong', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1108', name: 'Persediaan Dalam Perjalanan (Goods in Transit)', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1109', name: 'Aset Biologis / Barang Dalam Proses (WIP Agro)', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1110', name: 'Persediaan Hasil Panen', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1201', name: 'Peralatan Usaha & Mesin POS', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '1202', name: 'Akumulasi Penyusutan Peralatan', category: 'ASSET', normalBalance: 'CREDIT', isSystemLocked: true },

  // 2xxx — LIABILITAS (LIABILITIES)
  { code: '2101', name: 'Utang Usaha / Supplier', category: 'LIABILITY', normalBalance: 'CREDIT', isSystemLocked: true },
  { code: '2102', name: 'PPN Keluaran (PMK 131/2024)', category: 'LIABILITY', normalBalance: 'CREDIT', isSystemLocked: true },
  { code: '2103', name: 'Utang Pajak Daerah PB1 Restoran (10%)', category: 'LIABILITY', normalBalance: 'CREDIT', isSystemLocked: true },
  { code: '2104', name: 'Utang PPh Final UMKM 0,5% (PP 20/2026)', category: 'LIABILITY', normalBalance: 'CREDIT', isSystemLocked: true },
  { code: '2105', name: 'Utang PPh Pasal 21 / 23 / 4(2)', category: 'LIABILITY', normalBalance: 'CREDIT', isSystemLocked: true },
  { code: '2106', name: 'Utang Deposit Penghuni Kost', category: 'LIABILITY', normalBalance: 'CREDIT', isSystemLocked: true },

  // 3xxx — EKUITAS (EQUITY)
  { code: '3101', name: 'Modal Disetor Pemilik', category: 'EQUITY', normalBalance: 'CREDIT', isSystemLocked: true },
  { code: '3102', name: 'Prive / Penarikan Pemilik', category: 'EQUITY', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '3201', name: 'Laba Ditahan', category: 'EQUITY', normalBalance: 'CREDIT', isSystemLocked: true },

  // 4xxx — PENDAPATAN (REVENUE)
  { code: '4101', name: 'Pendapatan Penjualan / Jasa Utama', category: 'REVENUE', normalBalance: 'CREDIT', isSystemLocked: true },
  { code: '4102', name: 'Pendapatan Service Charge', category: 'REVENUE', normalBalance: 'CREDIT', isSystemLocked: true },
  { code: '4103', name: 'Diskon & Potongan Penjualan', category: 'REVENUE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '4104', name: 'Pendapatan Sewa Kamar Kost', category: 'REVENUE', normalBalance: 'CREDIT', isSystemLocked: true },

  // 5xxx — HPP (COGS)
  { code: '5101', name: 'Harga Pokok Penjualan (HPP)', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },

  // 6xxx — BEBAN OPERASIONAL (OPERATING EXPENSES)
  { code: '6101', name: 'Beban Gaji & Upah Karyawan', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6102', name: 'Beban Sewa Toko / Ruko', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6103', name: 'Beban Listrik, Air & Internet', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6104', name: 'Beban MDR QRIS & Payment Gateway', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6105', name: 'Beban Jasa Profesional & Konsultan', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6106', name: 'Beban Penyusutan Aset Tetap', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6107', name: 'Beban Pemasaran & Promosi', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6108', name: 'Beban Selisih / Kerusakan Persediaan', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6109', name: 'Beban / Selisih Kas Shift', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
  { code: '6201', name: 'Beban Pajak Penghasilan (PPh)', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
] as const;

export const DEFAULT_SAMPLE_TENANT_SEED = {
  masterAdminEmail: 'master@kasirakun.id',
  demoCustomerEmail: 'demo@kedaisenja.id',
  tenant: {
    name: 'Kedai Kopi Senja (Demo User)',
    slug: 'kedai-kopi-senja-demo',
    vertical: 'KEDAI_MAKAN' as const,
    taxEntity: 'WP_OP' as const,
    isPkp: false,
    npwp16: '3174081205920001',
    nitku22: '3174081205920001000001',
    address: 'Jl. Panglima Polim No. 45, Jakarta Selatan',
    receiptFooter: 'Terima kasih telah berkunjung ke Kedai Kopi Senja!',
  },
  activeModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX'] as const,
};

export interface PrismaSeedClientLike {
  featureModule: { upsert: (args: Record<string, unknown>) => Promise<unknown> };
  user?: { upsert: (args: Record<string, unknown>) => Promise<{ id: string }> };
  tenant?: { upsert: (args: Record<string, unknown>) => Promise<{ id: string }> };
  tenantMembership?: { upsert: (args: Record<string, unknown>) => Promise<unknown> };
  tenantSubscription?: { upsert: (args: Record<string, unknown>) => Promise<unknown> };
  account?: { upsert: (args: Record<string, unknown>) => Promise<unknown> };
  restaurantTable?: { upsert: (args: Record<string, unknown>) => Promise<unknown> };
}

export async function runPrismaSeed(prismaClient: PrismaSeedClientLike) {
  // 1. Seed 5 Modular Feature Packages
  for (const mod of DEFAULT_FEATURE_MODULES) {
    await prismaClient.featureModule.upsert({
      where: { code: mod.code },
      update: {
        name: mod.name,
        description: mod.description,
        monthlyPrice: mod.monthlyPrice,
        isCore: mod.isCore,
      },
      create: mod,
    });
  }

  // 2. Seed Master Owner & Demo Customer + Sample Tenant + 28 Base CoA Accounts when full client provided
  if (
    prismaClient.user &&
    prismaClient.tenant &&
    prismaClient.tenantMembership &&
    prismaClient.tenantSubscription &&
    prismaClient.account
  ) {
    await prismaClient.user.upsert({
      where: { email: DEFAULT_SAMPLE_TENANT_SEED.masterAdminEmail },
      update: { isSuperAdmin: true, name: 'Master Pemilik KasirAkun' },
      create: {
        email: DEFAULT_SAMPLE_TENANT_SEED.masterAdminEmail,
        passwordHash: 'SCRYPT_HASH_CONFIGURED_AT_RUNTIME',
        name: 'Master Pemilik KasirAkun',
        fullName: 'Master Pemilik KasirAkun',
        emailVerified: true,
        phone: '081100009999',
        isSuperAdmin: true,
        accountStatus: 'ACTIVE',
        maxTenantsAllowed: 999,
      },
    });

    const demoUser = await prismaClient.user.upsert({
      where: { email: DEFAULT_SAMPLE_TENANT_SEED.demoCustomerEmail },
      update: { name: 'Rina Kusuma (Akun Demo)' },
      create: {
        email: DEFAULT_SAMPLE_TENANT_SEED.demoCustomerEmail,
        passwordHash: 'SCRYPT_HASH_CONFIGURED_AT_RUNTIME',
        name: 'Rina Kusuma (Akun Demo)',
        fullName: 'Rina Kusuma (Akun Demo)',
        emailVerified: true,
        phone: '081234567890',
        isSuperAdmin: false,
        accountStatus: 'ACTIVE',
        maxTenantsAllowed: 3,
      },
    });

    const tenant = await prismaClient.tenant.upsert({
      where: { slug: DEFAULT_SAMPLE_TENANT_SEED.tenant.slug },
      update: {},
      create: {
        ...DEFAULT_SAMPLE_TENANT_SEED.tenant,
        settings: {
          autoPrintQrOrders: true,
          thermalPaperWidth: '80mm',
          qrisMdrRate: '0.007',
        },
      },
    });

    await prismaClient.tenantMembership.upsert({
      where: { userId_tenantId: { userId: demoUser.id, tenantId: tenant.id } },
      update: { isActive: true },
      create: {
        userId: demoUser.id,
        tenantId: tenant.id,
        role: 'OWNER',
        isActive: true,
      },
    });

    for (const moduleCode of DEFAULT_SAMPLE_TENANT_SEED.activeModules) {
      await prismaClient.tenantSubscription.upsert({
        where: { tenantId_moduleCode: { tenantId: tenant.id, moduleCode } },
        update: { status: 'ACTIVE' },
        create: {
          tenantId: tenant.id,
          moduleCode,
          status: 'ACTIVE',
        },
      });
    }

    for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
      await prismaClient.account.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: acc.code } },
        update: { name: acc.name },
        create: {
          tenantId: tenant.id,
          ...acc,
        },
      });
    }

    if (prismaClient.restaurantTable) {
      for (let i = 1; i <= 4; i += 1) {
        const num = String(i).padStart(2, '0');
        await prismaClient.restaurantTable.upsert({
          where: { tenantId_tableNumber: { tenantId: tenant.id, tableNumber: num } },
          update: { isActive: true },
          create: {
            tenantId: tenant.id,
            tableNumber: num,
            qrToken: `tbl-senja-${num}`,
            isActive: true,
          },
        });
      }
    }
  }
}
