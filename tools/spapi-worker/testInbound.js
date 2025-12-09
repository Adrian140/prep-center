import 'dotenv/config';
import { createSpClient } from './spapiClient.js';

const shipmentId = process.argv[2] || 'FBA15L507S2Z';
const marketplaceId = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH'; // FR default
const region = process.env.SPAPI_REGION || 'eu';

const client = createSpClient({
  refreshToken: process.env.SPAPI_REFRESH_TOKEN,
  region
});

const STATUS_LIST = ['WORKING', 'SHIPPED', 'RECEIVING', 'DELIVERED', 'CLOSED', 'CANCELLED', 'DELETED'];

async function run() {
  try {
    const res = await client.callAPI({
      operation: 'getShipments',
      endpoint: 'fulfillmentInbound',
      query: {
        ShipmentStatusList: STATUS_LIST,
        ShipmentIdList: [shipmentId],
        MarketplaceId: marketplaceId
      },
      options: { version: 'v0' }
    });
    console.log('Response payload:', JSON.stringify(res?.payload, null, 2));
  } catch (err) {
    console.error('Error code:', err.code);
    console.error('Message:', err.message);
    console.error('Response:', err.response);
    console.error('Request:', err.request);
  }
}

run();
