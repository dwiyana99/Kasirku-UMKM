/**
 * Payment Gateway Adapter Factory
 */

import type { PaymentGatewayProvider } from '../../../types/domain';
import type { PaymentGatewayAdapter } from './types';
import { MidtransAdapter } from './midtrans';
import { DuitkuAdapter } from './duitku';
import { TripayAdapter } from './tripay';
import { SimulatorAdapter } from './simulator';

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

export * from './types';
export { verifyMidtransSignature, buildMidtransChargePayload } from './midtrans';
export { verifyDuitkuSignature, computeDuitkuInquirySignature, mapChannelToDuitkuMethod } from './duitku';
export { verifyTripaySignature, computeTripayCreateSignature, mapChannelToTripayMethod } from './tripay';
export { generateDynamicEmvQris, signSimulatorWebhook } from './simulator';
