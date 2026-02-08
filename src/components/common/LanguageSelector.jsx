import React, { useState } from "react";
import { Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LanguageSelector() {
  const { currentLanguage, changeLanguage, languages } = useLanguage();
  const [open, setOpen] = useState(false);

  const items = Object.entries(languages).map(([code, meta]) => ({
    code,
    label: meta.name,
    flag: meta.flag
  }));
  const active = items.find((l) => l.code === currentLanguage) || items[0] || { flag: '🌐', label: currentLanguage };

  const handleSelect = (code) => {
    setOpen(false);
    changeLanguage(code);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 shadow-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Select language (${active.label})`}
      >
        <Globe className="w-4 h-4 text-gray-500" />
        <span
          className="text-lg leading-none"
          style={{ fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji' }}
        >
          {active.flag}
        </span>
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
              aria-selected={l.code === currentLanguage}
              onClick={() => handleSelect(l.code)}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${
                l.code === currentLanguage ? 'bg-gray-50 font-medium' : ''
              }`}
            >
              <span
                className="text-lg leading-none"
                style={{ fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji' }}
              >
                {l.flag}
              </span>
              <span className="text-sm">{l.label}</span>
              {l.code === currentLanguage ? <span className="ml-auto text-primary">✓</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
