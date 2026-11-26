/**
 * Payment Gateway Adapter Factory
 */

import type { PaymentGatewayProvider } from '../../../types/domain.ts';
import type { PaymentGatewayAdapter } from './types.ts';
import { MidtransAdapter } from './midtrans.ts';
import { SimulatorAdapter } from './simulator.ts';

const midtransAdapter = new MidtransAdapter();
const simulatorAdapter = new SimulatorAdapter();

export function getPaymentAdapter(provider: PaymentGatewayProvider): PaymentGatewayAdapter {
  switch (provider) {
    case 'MIDTRANS':
      return midtransAdapter;
    case 'SIMULATOR':
    case 'MANUAL_ONLY':
    default:
      return simulatorAdapter;
  }
}

export * from './types.ts';
export { verifyMidtransSignature, buildMidtransChargePayload } from './midtrans.ts';
export { generateDynamicEmvQris, signSimulatorWebhook } from './simulator.ts';
