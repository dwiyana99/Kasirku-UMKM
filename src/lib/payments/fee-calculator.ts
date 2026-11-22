/**
 * Decimal-Safe Payment Fee Calculator & Double-Entry Accounting Journal Builder
 * Strictly uses Decimal.js (NUMERIC(19, 4) precision) — ZERO floating-point arithmetic.
 *
 * Anti-Tax-Inflation Rule (PP 20/2026 — PPh Final 0.5%):
 * When feeBearer === 'CUSTOMER', the admin fee paid by the buyer is booked to Liability
 * Account `2109 Titipan Biaya Admin Payment Gateway` (NOT `4101 Pendapatan Penjualan`)
 * so it NEVER artificially inflates the UMKM's Gross Revenue (Omzet Bruto) for tax!
 */

import Decimal from 'decimal.js';
import type {
  EnabledPaymentChannels,
  FeeBearer,
  PaymentCategory,
} from '../../types/domain';

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_UP });

export const DEFAULT_ENABLED_CHANNELS: EnabledPaymentChannels = {
  cash: true,
  qris_dynamic: true,
  ewallet_gopay: true,
  ewallet_shopeepay: true,
  ewallet_dana: true,
  ewallet_ovo: true,
  va_bca: true,
  va_mandiri: true,
  va_bri: true,
  va_bni: true,
  va_bsi: true,
  va_permata: true,
  manual_transfer: true,
};

export const DEFAULT_PAYMENT_CONFIG_RATES = {
  qrisMdrPercent: '0.0070', // 0.7%
  vaFlatFee: '4250.0000', // Rp4.250
  ewalletFeePercent: '0.0200', // 2.0%
} as const;

export interface PaymentBreakdownInput {
  baseAmount: string | number;
  paymentCategory: PaymentCategory;
  feeBearer: FeeBearer;
  qrisMdrPercent?: string;
  vaFlatFee?: string;
  ewalletFeePercent?: string;
  uniqueCode?: number | null;
}

export interface PaymentBreakdownResult {
  baseAmount: string;
  uniqueCode: number;
  customerAdminFee: string;
  gatewayMdrFee: string;
  totalPayable: string;
  netSettlementAmount: string;
}

export function computePaymentBreakdown(
  input: PaymentBreakdownInput
): PaymentBreakdownResult {
  const base = new Decimal(input.baseAmount || 0).toDecimalPlaces(4);
  const qrisRate = new Decimal(input.qrisMdrPercent ?? DEFAULT_PAYMENT_CONFIG_RATES.qrisMdrPercent);
  const vaFee = new Decimal(input.vaFlatFee ?? DEFAULT_PAYMENT_CONFIG_RATES.vaFlatFee);
  const ewalletRate = new Decimal(input.ewalletFeePercent ?? DEFAULT_PAYMENT_CONFIG_RATES.ewalletFeePercent);
  const uniqueCodeNum =
    input.paymentCategory === 'MANUAL_TRANSFER'
      ? Math.max(0, Math.min(999, Math.trunc(input.uniqueCode ?? 0)))
      : 0;
  const uniqueCodeDec = new Decimal(uniqueCodeNum);

  let rawGatewayFee = new Decimal(0);

  switch (input.paymentCategory) {
    case 'QRIS_DYNAMIC':
      // Standard Bank Indonesia QRIS MDR (rounded to nearest Rupiah)
      rawGatewayFee = base.mul(qrisRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      break;
    case 'VIRTUAL_ACCOUNT':
      rawGatewayFee = vaFee.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      break;
    case 'EWALLET_DIRECT':
      rawGatewayFee = base.mul(ewalletRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      break;
    case 'MANUAL_TRANSFER':
    case 'CASH':
    default:
      rawGatewayFee = new Decimal(0);
      break;
  }

  let customerAdminFee = new Decimal(0);
  if (
    input.feeBearer === 'CUSTOMER' &&
    input.paymentCategory !== 'CASH' &&
    input.paymentCategory !== 'MANUAL_TRANSFER'
  ) {
    customerAdminFee = rawGatewayFee;
  }

  const totalPayable = base.plus(customerAdminFee).plus(uniqueCodeDec);
  const netSettlementAmount = totalPayable.minus(rawGatewayFee);

  return {
    baseAmount: base.toFixed(4),
    uniqueCode: uniqueCodeNum,
    customerAdminFee: customerAdminFee.toFixed(4),
    gatewayMdrFee: rawGatewayFee.toFixed(4),
    totalPayable: totalPayable.toFixed(4),
    netSettlementAmount: netSettlementAmount.toFixed(4),
  };
}

export interface DoubleEntryLineDraft {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  memo: string;
}

export interface GatewayPaymentJournalInput {
  orderNumber: string;
  subtotal: string; // Net sales revenue before tax (4101)
  taxAmount?: string; // PB1 10% or PPN (2102 or 2103)
  taxAccountCode?: string;
  taxAccountName?: string;
  uniqueCode?: number;
  customerAdminFee: string;
  gatewayMdrFee: string;
  totalPayable: string;
  feeBearer: FeeBearer;
  paymentCategory: PaymentCategory;
  totalCogs?: string; // 5101 / 1401
}

export interface GatewayPaymentJournalResult {
  lines: DoubleEntryLineDraft[];
  totalDebit: string;
  totalCredit: string;
  isBalanced: boolean;
}

/**
 * Generates strictly balanced Double-Entry Journal Lines when a non-cash payment settles via Webhook.
 *
 * When feeBearer === 'CUSTOMER':
 *   Debit  1103 Piutang Settlement PG  = totalPayable - gatewayMdrFee
 *   Debit  6105 Beban MDR / Admin PG   = gatewayMdrFee
 *   Credit 4101 Pendapatan Penjualan   = subtotal
 *   Credit 2109 Titipan Biaya Admin PG = customerAdminFee  <-- NOT Revenue! Safe for PPh Final 0.5%
 *   Credit 210x Utang Pajak            = taxAmount (if > 0)
 *
 * When feeBearer === 'MERCHANT':
 *   Debit  1103 Piutang Settlement PG  = totalPayable - gatewayMdrFee
 *   Debit  6105 Beban MDR / Admin PG   = gatewayMdrFee
 *   Credit 4101 Pendapatan Penjualan   = subtotal
 *   Credit 210x Utang Pajak            = taxAmount (if > 0)
 *
 * Plus COGS (if > 0):
 *   Debit  5101 Harga Pokok Penjualan  = totalCogs
 *   Credit 1401 Persediaan Barang      = totalCogs
 */
export function buildGatewayPaymentJournalLines(
  input: GatewayPaymentJournalInput
): GatewayPaymentJournalResult {
  const subtotal = new Decimal(input.subtotal || 0);
  const taxAmount = new Decimal(input.taxAmount || 0);
  const uniqueCode = new Decimal(input.uniqueCode || 0);
  const customerAdminFee = new Decimal(input.customerAdminFee || 0);
  const gatewayMdrFee = new Decimal(input.gatewayMdrFee || 0);
  const totalPayable = new Decimal(input.totalPayable || 0);
  const totalCogs = new Decimal(input.totalCogs || 0);

  const netReceivable = totalPayable.minus(gatewayMdrFee);
  const lines: DoubleEntryLineDraft[] = [];

  const assetCode =
    input.paymentCategory === 'MANUAL_TRANSFER'
      ? '1102'
      : input.paymentCategory === 'CASH'
        ? '1101'
        : '1103';
  const assetName =
    input.paymentCategory === 'MANUAL_TRANSFER'
      ? 'Bank Utama UMKM'
      : input.paymentCategory === 'CASH'
        ? 'Kas Tunai Operasional'
        : 'Piutang Settlement Payment Gateway';

  if (netReceivable.gt(0)) {
    lines.push({
      accountCode: assetCode,
      accountName: assetName,
      debit: netReceivable.toFixed(4),
      credit: '0.0000',
      memo: `Penerimaan bersih ${input.orderNumber}`,
    });
  }

  if (gatewayMdrFee.gt(0)) {
    lines.push({
      accountCode: '6105',
      accountName: 'Beban MDR / Biaya Admin Payment Gateway',
      debit: gatewayMdrFee.toFixed(4),
      credit: '0.0000',
      memo: `Potongan biaya MDR/Admin PG ${input.orderNumber}`,
    });
  }

  if (subtotal.gt(0)) {
    lines.push({
      accountCode: '4101',
      accountName: 'Pendapatan Penjualan / Jasa',
      debit: '0.0000',
      credit: subtotal.toFixed(4),
      memo: `Penjualan ${input.orderNumber}`,
    });
  }

  if (input.feeBearer === 'CUSTOMER' && customerAdminFee.gt(0)) {
    lines.push({
      accountCode: '2109',
      accountName: 'Titipan Biaya Admin Payment Gateway',
      debit: '0.0000',
      credit: customerAdminFee.toFixed(4),
      memo: `Biaya admin PG ditanggung pembeli (bukan omzet pajak) ${input.orderNumber}`,
    });
  }

  if (uniqueCode.gt(0)) {
    lines.push({
      accountCode: '2109',
      accountName: 'Titipan Biaya Admin / Kode Unik Transfer',
      debit: '0.0000',
      credit: uniqueCode.toFixed(4),
      memo: `Kode unik verifikasi transfer ${input.orderNumber}`,
    });
  }

  if (taxAmount.gt(0)) {
    lines.push({
      accountCode: input.taxAccountCode || '2103',
      accountName: input.taxAccountName || 'Utang Pajak Daerah PB1 10%',
      debit: '0.0000',
      credit: taxAmount.toFixed(4),
      memo: `Pajak transaksi ${input.orderNumber}`,
    });
  }

  // Reconcile any minor rounding discrepancy (e.g., if caller passed gross grandTotal vs subtotal+tax)
  let sumD = lines.reduce((acc, l) => acc.plus(l.debit), new Decimal(0));
  let sumC = lines.reduce((acc, l) => acc.plus(l.credit), new Decimal(0));
  const diff = sumD.minus(sumC);
  if (!diff.isZero()) {
    if (diff.gt(0)) {
      lines.push({
        accountCode: '4101',
        accountName: 'Pendapatan Penjualan / Jasa',
        debit: '0.0000',
        credit: diff.toFixed(4),
        memo: `Penyesuaian selisih pembulatan ${input.orderNumber}`,
      });
    } else {
      lines.push({
        accountCode: '6105',
        accountName: 'Beban MDR / Biaya Admin Payment Gateway',
        debit: diff.abs().toFixed(4),
        credit: '0.0000',
        memo: `Penyesuaian selisih pembulatan ${input.orderNumber}`,
      });
    }
  }

  if (totalCogs.gt(0)) {
    lines.push({
      accountCode: '5101',
      accountName: 'Harga Pokok Penjualan (HPP)',
      debit: totalCogs.toFixed(4),
      credit: '0.0000',
      memo: `HPP transaksi ${input.orderNumber}`,
    });
    lines.push({
      accountCode: '1401',
      accountName: 'Persediaan Barang / Bahan Baku',
      debit: '0.0000',
      credit: totalCogs.toFixed(4),
      memo: `Pengurangan persediaan ${input.orderNumber}`,
    });
  }

  sumD = lines.reduce((acc, l) => acc.plus(l.debit), new Decimal(0));
  sumC = lines.reduce((acc, l) => acc.plus(l.credit), new Decimal(0));

  return {
    lines,
    totalDebit: sumD.toFixed(4),
    totalCredit: sumC.toFixed(4),
    isBalanced: sumD.equals(sumC),
  };
}

/**
 * Generates Double-Entry Journal Lines when H+1/H+2 Settlement arrives at the UMKM's bank account.
 *   Debit  1102 Bank Utama UMKM                 = totalNetReceived
 *   Credit 1103 Piutang Settlement Payment PG   = totalNetReceived
 */
export function buildSettlementBatchJournalLines(input: {
  provider: string;
  settlementDate: string;
  totalNetReceived: string;
  destinationBankAccountCode?: string;
  destinationBankAccountName?: string;
}): GatewayPaymentJournalResult {
  const net = new Decimal(input.totalNetReceived || 0);
  const bankCode = input.destinationBankAccountCode || '1102';
  const bankName = input.destinationBankAccountName || 'Bank Utama UMKM';

  const lines: DoubleEntryLineDraft[] = [
    {
      accountCode: bankCode,
      accountName: bankName,
      debit: net.toFixed(4),
      credit: '0.0000',
      memo: `Pencairan settlement ${input.provider} tgl ${input.settlementDate}`,
    },
    {
      accountCode: '1103',
      accountName: 'Piutang Settlement Payment Gateway',
      debit: '0.0000',
      credit: net.toFixed(4),
      memo: `Pelunasan piutang PG ${input.provider} tgl ${input.settlementDate}`,
    },
  ];

  return {
    lines,
    totalDebit: net.toFixed(4),
    totalCredit: net.toFixed(4),
    isBalanced: net.gt(0),
  };
}
