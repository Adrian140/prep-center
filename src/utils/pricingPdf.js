import { saveAs } from 'file-saver';

export async function exportPricingPdf(groups, filename = 'pricing.pdf') {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const marginX = 14;
  let cursorY = 20;

  doc.setFontSize(18);
  doc.text('Services & Pricing', marginX, cursorY);

  const categories = Object.entries(groups || {});
  doc.setFontSize(12);

  categories.forEach(([category, rows]) => {
    cursorY += 10;
    if (cursorY > 280) {
      doc.addPage();
      cursorY = 20;
    }
    doc.setFont(undefined, 'bold');
    doc.text(category, marginX, cursorY);
    doc.setFont(undefined, 'normal');

    (rows || []).forEach((row) => {
      cursorY += 7;
      if (cursorY > 280) {
        doc.addPage();
        cursorY = 20;
      }
      const line = `${row.service_name || '—'} – ${row.price || '€0.00'} / ${row.unit || ''}`;
      doc.text(line, marginX + 4, cursorY);
    });
  });

  const blob = doc.output('blob');
  saveAs(blob, filename);
}
