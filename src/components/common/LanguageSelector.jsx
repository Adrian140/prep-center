import React, { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LanguageSelector() {
  const { currentLanguage, changeLanguage, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(currentLanguage);

  // ținem butonul sincron cu contextul (și cu orice schimbare externă)
  useEffect(() => {
    setLang(currentLanguage);
  }, [currentLanguage]);

  const items = Object.entries(languages).map(([code, meta]) => ({
    code,
    label: meta.name,
    flag: meta.flag
  }));
  const active = items.find((l) => l.code === lang) || items[0] || { flag: '🌐', label: lang };

  const handleSelect = (code) => {
    setLang(code);
    setOpen(false);
    changeLanguage(code);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 shadow-sm min-w-[140px] justify-between"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select language"
      >
        <span className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-gray-500" />
          <span className="text-lg leading-none">{active.flag}</span>
          <span className="text-sm font-medium">{active.label}</span>
        </span>
        <span className="ml-1 text-xs text-gray-500">▾</span>
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
              onClick={() => handleSelect(l.code)}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${
                l.code === lang ? 'bg-gray-50 font-medium' : ''
              }`}
            >
              <span className="text-lg leading-none">{l.flag}</span>
              <span className="text-sm">{l.label}</span>
              {l.code === lang ? <span className="ml-auto text-primary">✓</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
