/**
 * Payment Gateway Adapter Factory
 */

import type { PaymentGatewayProvider } from '../../../types/domain.ts';
import type { PaymentGatewayAdapter } from './types.ts';
import { MidtransAdapter } from './midtrans.ts';
import { DuitkuAdapter } from './duitku.ts';
import { TripayAdapter } from './tripay.ts';
import { SimulatorAdapter } from './simulator.ts';

const midtransAdapter = new MidtransAdapter();
const duitkuAdapter = new DuitkuAdapter();
const tripayAdapter = new TripayAdapter();
const simulatorAdapter = new SimulatorAdapter();

export function getPaymentAdapter(provider: PaymentGatewayProvider): PaymentGatewayAdapter {
  switch (provider) {
    case 'MIDTRANS':
      return midtransAdapter;
    case 'DUITKU':
      return duitkuAdapter;
    case 'TRIPAY':
      return tripayAdapter;
    case 'SIMULATOR':
    case 'MANUAL_ONLY':
    default:
      return simulatorAdapter;
  }
}

export * from './types.ts';
export { verifyMidtransSignature, buildMidtransChargePayload } from './midtrans.ts';
export { verifyDuitkuSignature, computeDuitkuInquirySignature, mapChannelToDuitkuMethod } from './duitku.ts';
export { verifyTripaySignature, computeTripayCreateSignature, mapChannelToTripayMethod } from './tripay.ts';
export { generateDynamicEmvQris, signSimulatorWebhook } from './simulator.ts';
