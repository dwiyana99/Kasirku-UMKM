import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GLOBAL_CONTRACT_TEMPLATES,
  buildContractWaDeliveryUrl,
  getContractFormMetaForVertical,
  getTemplatesForVertical,
  renderContractTemplate,
  verticalSupportsDigitalContracts,
} from './digital-contract-engine';

test('verticalSupportsDigitalContracts enables rental/service/property verticals and hides retail/F&B', () => {
  assert.equal(verticalSupportsDigitalContracts('RENTAL_KENDARAAN'), true);
  assert.equal(verticalSupportsDigitalContracts('FREELANCE'), true);
  assert.equal(verticalSupportsDigitalContracts('KOST_KONTRAKAN'), true);
  assert.equal(verticalSupportsDigitalContracts('HOMESTAY_VILLA'), true);
  assert.equal(verticalSupportsDigitalContracts('WARUNG_SEMBAKO'), false);
  assert.equal(verticalSupportsDigitalContracts('RESTORAN'), false);
  assert.equal(verticalSupportsDigitalContracts('BARBERSHOP'), false);
});

test('getTemplatesForVertical strictly locks templates to active UMKM vertical (zero cross-vertical leak)', () => {
  const kostTemplates = getTemplatesForVertical('KOST_KONTRAKAN', DEFAULT_GLOBAL_CONTRACT_TEMPLATES);
  assert.ok(kostTemplates.length >= 1);
  assert.ok(kostTemplates.every((t) => t.applicableVerticals.includes('KOST_KONTRAKAN')));
  assert.ok(!kostTemplates.some((t) => t.id === 'tpl-sewa-kendaraan'));
  assert.ok(
    !kostTemplates.some(
      (t) =>
        t.name.toLowerCase().includes('kendaraan') ||
        t.headerTitle.toLowerCase().includes('kendaraan')
    )
  );

  const rentalTemplates = getTemplatesForVertical('RENTAL_KENDARAAN', DEFAULT_GLOBAL_CONTRACT_TEMPLATES);
  assert.ok(rentalTemplates.length >= 1);
  assert.ok(rentalTemplates.every((t) => t.applicableVerticals.includes('RENTAL_KENDARAAN')));
  assert.ok(!rentalTemplates.some((t) => t.id === 'tpl-sewa-properti'));

  const kostMeta = getContractFormMetaForVertical('KOST_KONTRAKAN');
  assert.equal(kostMeta.defaultCategory, 'SEWA_PROPERTI');
  assert.deepEqual(kostMeta.allowedCategories, ['SEWA_PROPERTI']);
  assert.ok(!kostMeta.objectPlaceholder.toLowerCase().includes('avanza'));
});

test('renderContractTemplate substitutes all placeholders with formatted Rupiah and Indonesian dates', () => {
  const tpl = DEFAULT_GLOBAL_CONTRACT_TEMPLATES[0];
  const rendered = renderContractTemplate(tpl, {
    nomorKontrak: 'KTR-2026-001',
    tanggalKontrak: '2026-11-22',
    namaUsaha: 'Rental Maju Jaya',
    alamatUsaha: 'Jl. Merdeka 10, Bandung',
    waUsaha: '081234567890',
    namaPelanggan: 'Budi Santoso',
    nikPelanggan: '3273011234560001',
    waPelanggan: '081987654321',
    objekLayanan: 'Toyota Avanza 2024 (D 1234 ABC)',
    tanggalMulai: '2026-11-23',
    tanggalSelesai: '2026-11-25',
    nilaiKontrak: '900000',
    nilaiDeposit: '300000',
    catatanKhusus: 'BBM penuh saat kembali',
  });

  assert.match(rendered, /KTR-2026-001/);
  assert.match(rendered, /Rental Maju Jaya/);
  assert.match(rendered, /Budi Santoso/);
  assert.match(rendered, /Rp900\.000/);
  assert.match(rendered, /Rp300\.000/);
  assert.match(rendered, /22 Nov 2026/);
  assert.match(rendered, /23 Nov 2026/);
  assert.ok(!rendered.includes('{{'));
});

test('buildContractWaDeliveryUrl generates valid wa.me link when owner WA is filled', () => {
  const res = buildContractWaDeliveryUrl({
    businessWhatsappNumber: '081234567890',
    customerPhone: '081987654321',
    businessName: 'Rental Maju Jaya',
    contractNumber: 'KTR-2026-001',
    customerName: 'Budi Santoso',
    renderedText: 'Isi kontrak tes',
  });

  assert.equal(res.ok, true);
  assert.ok(res.url?.startsWith('https://wa.me/6281987654321?text='));

  const noWa = buildContractWaDeliveryUrl({
    businessWhatsappNumber: '',
    customerPhone: '081987654321',
    businessName: 'Rental Maju Jaya',
    contractNumber: 'KTR-2026-001',
    customerName: 'Budi Santoso',
    renderedText: 'Isi kontrak tes',
  });
  assert.equal(noWa.ok, false);
});

import { getDynamicContractServiceOptions } from './digital-contract-engine';

test('getDynamicContractServiceOptions filters live rooms/vehicles strictly by active UMKM vertical', () => {
  const mixedWorkspace = {
    boardingRooms: [
      {
        id: 'rm-101',
        roomNumber: '101',
        roomType: 'Deluxe AC + KM Dalam',
        monthlyRate: '1650000',
        includedFacilities: ['Air PDAM', 'Listrik', 'Wi-Fi', 'AC'],
        status: 'OCCUPIED',
      },
    ],
    boardingTenants: [
      {
        id: 'bt-1',
        roomId: 'rm-101',
        fullName: 'Nadia Larasati',
        nikKtp: '3174015506960001',
        phoneWa: '081210102001',
        checkInDate: '2026-09-01',
        nextDueDate: '2026-12-01',
        billingCycle: 'BULANAN' as const,
        depositAmount: '1000000',
        includedFacilities: ['Air PDAM', 'Listrik', 'Wi-Fi', 'AC'],
        facilityAddOns: [{ id: 'ao-1', name: 'Parkir Mobil', monthlyFee: '150000' }],
        isActive: true,
      },
    ],
    verticalOps: {
      rentalVehicles: [
        {
          id: 'veh-1',
          name: 'Toyota Avanza 2024',
          plateNumber: 'B 1234 XYZ',
          vehicleType: 'MPV',
          dailyRate: '450000',
          status: 'TERSEDIA',
        },
      ],
    },
  };

  const kostOptions = getDynamicContractServiceOptions('KOST_KONTRAKAN', mixedWorkspace);
  assert.equal(kostOptions.length, 1);
  assert.ok(kostOptions[0].label.includes('Kamar 101'));
  assert.equal(kostOptions[0].customerName, 'Nadia Larasati');
  assert.equal(kostOptions[0].facilityAddOns?.length, 1);
  assert.ok(!kostOptions.some((o) => o.label.includes('Avanza')));

  const rentalOptions = getDynamicContractServiceOptions('RENTAL_KENDARAAN', mixedWorkspace);
  assert.equal(rentalOptions.length, 1);
  assert.ok(rentalOptions[0].label.includes('Toyota Avanza'));
  assert.ok(!rentalOptions.some((o) => o.label.includes('Kamar 101')));
});
