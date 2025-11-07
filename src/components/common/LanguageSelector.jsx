import React, { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LanguageSelector() {
  const { currentLanguage, changeLanguage, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(currentLanguage);

  // ținem butonul sincron cu contextul (și cu orice schimbare externă)
  useEffect(() => { setLang(currentLanguage); }, [currentLanguage]);

  const items = Object.entries(languages).map(([code, meta]) => ({
    code, label: meta.name, flag: meta.flag
  }));
  const active = items.find(l => l.code === lang) || items[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 shadow-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe className="w-4 h-4" />
        <span>{active.flag} {active.label}</span>
        <span className="ml-1">▾</span>
      </button>

      {open && (
        <ul
          className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg max-h-80 overflow-auto z-50"
          role="listbox"
        >
          {items.map((l) => (
            <li
              key={l.code}
              role="option"
              aria-selected={l.code === lang}
              onClick={() => {
                changeLanguage(l.code);   // ← CHEIA: schimbăm contextul, nu i18n.js
                setOpen(false);
              }}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${
                l.code === lang ? "bg-gray-50 font-medium" : ""
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
              {l.code === lang ? <span className="ml-auto">✓</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
