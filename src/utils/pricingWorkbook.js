import { downloadCsv } from './csv';

export async function exportPricingWorkbook(groups, filename = 'pricing.csv') {
  const rows = [['Category', 'Service', 'Price', 'Unit']];

  Object.entries(groups || {}).forEach(([category, items]) => {
    (items || []).forEach((item) => {
      rows.push([
        category || '',
        item?.service_name || '',
        item?.price || '',
        item?.unit || ''
      ]);
    });
  });

  downloadCsv(rows, filename);
}
