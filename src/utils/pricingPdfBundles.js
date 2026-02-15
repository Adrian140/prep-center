import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';

export async function exportPricingBundlePdf({ title, categories = [], groups = {}, filename }) {
  const doc = new jsPDF();
  const marginX = 14;
  const pageHeight = 280;
  let cursorY = 20;

  doc.setFontSize(18);
  doc.text(title || 'Pricing', marginX, cursorY);
  cursorY += 8;
  doc.setFontSize(12);

  categories.forEach((category) => {
    const items = groups?.[category] || [];
    if (items.length === 0) return;

    cursorY += 6;
    if (cursorY > pageHeight) {
      doc.addPage();
      cursorY = 20;
    }
    doc.setFont(undefined, 'bold');
    doc.text(category, marginX, cursorY);
    doc.setFont(undefined, 'normal');

    items.forEach((item) => {
      const line = `${item?.service_name || '—'} – ${item?.price || '—'} / ${item?.unit || ''}`;
      const lines = doc.splitTextToSize(line, 180);
      lines.forEach((text) => {
        cursorY += 6;
        if (cursorY > pageHeight) {
          doc.addPage();
          cursorY = 20;
        }
        doc.text(text, marginX + 4, cursorY);
      });
    });
  });

  const blob = doc.output('blob');
  saveAs(blob, filename || 'pricing.pdf');
}
