// FILE: src/config/formspree.js
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xandwobv";

/**
 * Trimite un email către contact@prep-center.eu prin Formspree.
 * p = {
 *   clientName, clientEmail, companyName, country,
 *   items: [{ ean, qty, asinOrSku, link, price }]
 * }
 */
export async function sendPrepEmail(p) {
  const header = `| EAN | Qty | ASIN/SKU | Link | Price |\n|---|---:|---|---|---:|`;
  const rows = (p.items || []).map(it => {
    const link = it.link ? `[open](${it.link})` : "";
    const price = Number.isFinite(Number(it.price)) ? Number(it.price).toFixed(2) : "";
    return `| ${it.ean || ""} | ${it.qty || 0} | ${it.asinOrSku || ""} | ${link} | ${price} |`;
  });
  const table = [header, ...rows].join("\n");

  const payload = {
    client_name: p.clientName || "",
    client_email: p.clientEmail || "",
    company_name: p.companyName || "",
    country: p.country || "",
    items_markdown: table,
    _subject: `New prep request — ${p.clientName || "Client"}`,
  };

  const formData = new FormData();
  Object.entries(payload).forEach(([k, v]) => formData.append(k, v));

  const res = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    body: formData,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Formspree error ${res.status}: ${text}`);
  }
  return true;
}
