// FILE: src/components/TermsOfService.jsx
import React from "react";
import { Scale } from "lucide-react";
import { useTermsTranslation } from "@/translations";

export default function TermsOfService() {
  const { t } = useTermsTranslation();

  // helper: dacă lipsesc cheile, t() returnează exact path-ul cerut → îl tratăm ca "missing"
  const missing = (v, path) => v === path || v == null;
  const txt = (path) => {
    const v = t(path);
    return missing(v, path) ? null : String(v);
  };
  const arr = (path) => {
    const v = t(path);
    if (missing(v, path)) return [];
    return Array.isArray(v) ? v : (typeof v === "string" && v ? [v] : []);
  };

  const Section = ({ h, p, list }) => {
    const title = txt(h);
    const para = p ? txt(p) : null;
    const items = list ? arr(list) : [];
    if (!title && !para && items.length === 0) return null;
    return (
      <section>
        {title && <h2 className="text-2xl font-bold text-text-primary mb-4">{title}</h2>}
        {para && <p className="text-text-secondary leading-relaxed">{para}</p>}
        {items.length > 0 && (
          <ul className="list-disc list-inside text-text-secondary space-y-2">
            {items.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        )}
      </section>
    );
  };

  // ordinea completă a secțiunilor 0–20 din fișierul de traduceri
  const ORDER = [
    { key: "defs" },
    { key: "scope" },
    { key: "orders" },
    { key: "sla" },
    { key: "receiving" },
    { key: "packaging" },
    { key: "storage" },
    { key: "abandoned" },
    { key: "shipping" },
    { key: "insurance" },
    // pricing are câmpuri speciale
    { key: "pricing", special: "pricing" },
    { key: "warranties" },
    { key: "liability" },
    { key: "force" },
    { key: "subcontractors" },
    { key: "confidentiality" },
    { key: "data" },
    { key: "notices" },
    { key: "law" },
    { key: "language" },
    { key: "severability" },
  ];

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Scale className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-text-primary mb-4">{txt("title")}</h1>
          <p className="text-xl text-text-secondary">{txt("lastUpdated")}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-8">
          {ORDER.map(({ key, special }) => {
            if (special === "pricing") {
              const h = txt("sections.pricing_h");
              if (!h) return null;
              return (
                <section key={key}>
                  <h2 className="text-2xl font-bold text-text-primary mb-4">{h}</h2>
                  {txt("sections.pricing_intro") && (
                    <p className="text-text-secondary">{txt("sections.pricing_intro")}</p>
                  )}
                  {arr("sections.pricing_list").length > 0 && (
                    <ul className="list-disc list-inside text-text-secondary space-y-2">
                      {arr("sections.pricing_list").map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  )}
                  {["pricing_nonrefund","pricing_extra","pricing_accept","pricing_notice"].map((k) =>
                    txt(`sections.${k}`) ? (
                      <p className="text-text-secondary" key={k}>{txt(`sections.${k}`)}</p>
                    ) : null
                  )}
                </section>
              );
            }
            const base = `sections.${key}`;
            return (
              <Section
                key={key}
                h={`${base}_h`}
                p={`${base}_p`}
                list={`${base}_list`}
              />
            );
          })}

          {/* Contact */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{txt("sections.contact_h")}</h2>
            <div className="bg-primary-light bg-opacity-10 p-6 rounded-lg space-y-2">
              {txt("sections.contact_intro") && (
                <p className="text-text-secondary">{txt("sections.contact_intro")}</p>
              )}
              {txt("sections.contact_email") && (
                <p className="text-text-secondary"><strong>{txt("sections.contact_email")}</strong></p>
              )}
              {txt("sections.contact_phone") && (
                <p className="text-text-secondary"><strong>{txt("sections.contact_phone")}</strong></p>
              )}
              {txt("sections.contact_addr") && (
                <p className="text-text-secondary"><strong>{txt("sections.contact_addr")}</strong></p>
              )}
            </div>
          </section>

          {/* Updates */}
          <Section h="sections.updates_h" p="sections.updates_p" />
        </div>
      </div>
    </div>
  );
}
