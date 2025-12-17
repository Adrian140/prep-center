import { saveAs } from 'file-saver';

export async function exportPricingWorkbook(groups, filename = 'pricing.xlsx') {
  const XLSX = await import('xlsx');
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

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pricing');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  saveAs(blob, filename);
}
