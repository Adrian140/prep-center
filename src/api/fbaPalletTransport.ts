import { supabaseClient } from '@/lib/supabaseClient';

export type PalletEstimatePayload = {
  inboundPlanId: string;
  placementOptionId: string;
  shipmentId: string;
  readyToShipDate: string; // ISO
  pallets: Array<{
    quantity: number;
    dimensions: { length: number; width: number; height: number; unit: 'IN' | 'CM' };
    weight: { value: number; unit: 'LB' | 'KG' };
    stackability?: 'STACKABLE' | 'NON_STACKABLE';
  }>;
  freightClass?: string;
  declaredValue?: number;
  amazonIntegrationId?: string | null;
};

export type PalletOption = {
  id?: string;
  transportationOptionId?: string;
  optionId?: string;
  raw?: any;
  mode?: string;
  shippingMode?: string;
  shippingSolution?: string;
  partnered?: boolean;
  charge?: number | null;
  carrierName?: string | null;
};

export type PalletOptionsResponse = {
  options: PalletOption[];
  summary: any;
  traceId?: string;
};

export async function fetchPalletOptions(payload: PalletEstimatePayload): Promise<PalletOptionsResponse> {
  const { data, error } = await supabaseClient.functions.invoke('fba-ltl-options', {
    body: payload
  });
  if (error) throw error;
  const options = data?.list?.options || [];
  const summary = data?.list?.summary || null;
  return { options, summary, traceId: data?.traceId };
}
