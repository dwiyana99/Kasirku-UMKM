import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GLOBAL_CONTRACT_TEMPLATES,
  buildContractWaDeliveryUrl,
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

test('renderContractTemplate substitutes all placeholders with formatted Rupiah', () => {
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
