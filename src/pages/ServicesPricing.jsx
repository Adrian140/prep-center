import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileDown, ArrowRight, Tag, Package, Boxes, Truck, Archive,
  Shield, Layers, Settings, CheckCircle, Zap, Globe, Clock
} from "lucide-react";
import { supabaseHelpers } from "../config/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useSupabaseAuth } from "../contexts/SupabaseAuthContext";
import { useMarket } from "@/contexts/MarketContext";
import { useServicesTranslation } from "../translations/services";
import { exportPricingBundlePdf } from "../utils/pricingPdfBundles";

/* ── reusable fade-in ── */
function FadeIn({ children, className = "", delay = 0 }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  );
}

/* ── constants ── */
const CATEGORY_ORDER = [
  { id: "FBA Prep Services", key: "fba" },
  { id: "FBM Fulfillment", key: "fbm" },
  { id: "Extra Services", key: "extra" },
  { id: "Storage", key: "storage" }
];

const DOMESTIC_COLUMNS = ["0.25", "0.5", "1", "20"];
const INTERNATIONAL_COLUMNS = {
  "Germany/Austria": ["0.5", "1", "10", "20"],
  Spain: ["0.5", "1", "10", "20"],
  Italy: ["0.5", "1", "10", "20"],
  Belgium: ["0.5", "1", "10", "20"],
  "United Kingdom": ["0.5", "1", "2", "5"]
};

const PERIOD_OPTIONS = [
  { id: "1m", labelKey: "oneMonth", multiplier: 1 },
  { id: "3m", labelKey: "threeMonths", multiplier: 3 },
  { id: "6m", labelKey: "sixMonths", multiplier: 6 },
  { id: "12m", labelKey: "twelveMonths", multiplier: 12 }
];

const PROVIDER_BADGES = {
  Colissimo: { bg: "#FEF3C7", text: "#92400E" },
  "Colis Prive": { bg: "#E0F2FE", text: "#075985" },
  UPS: { bg: "#EDE9FE", text: "#5B21B6" },
  "Mondial Relay": { bg: "#FDE68A", text: "#92400E" },
  Chronopost: { bg: "#DBEAFE", text: "#1D4ED8" },
  FedEx: { bg: "#F3E8FF", text: "#6B21A8" }
};

const PUBLIC_GROUPS = [
  { key: "prep", icon: Package, color: "blue" },
  { key: "fulfillment", icon: Truck, color: "emerald" },
  { key: "storage", icon: Archive, color: "violet" },
  { key: "extras", icon: Boxes, color: "amber" }
];

const SECTION_COLORS = {
  fba: { accent: "bg-blue-600", border: "border-blue-200", hoverBorder: "hover:border-blue-300", iconBg: "bg-blue-600", iconText: "text-blue-600", pill: "bg-blue-100 text-blue-800", bg: "bg-blue-50/50" },
  fbm: { accent: "bg-emerald-600", border: "border-emerald-200", hoverBorder: "hover:border-emerald-300", iconBg: "bg-emerald-600", iconText: "text-emerald-600", pill: "bg-emerald-100 text-emerald-800", bg: "bg-emerald-50/50" },
  extra: { accent: "bg-amber-500", border: "border-amber-200", hoverBorder: "hover:border-amber-300", iconBg: "bg-amber-500", iconText: "text-amber-600", pill: "bg-amber-100 text-amber-800", bg: "bg-amber-50/50" },
  storage: { accent: "bg-violet-600", border: "border-violet-200", hoverBorder: "hover:border-violet-300", iconBg: "bg-violet-600", iconText: "text-violet-600", pill: "bg-violet-100 text-violet-800", bg: "bg-violet-50/50" },
  custom: { accent: "bg-gray-600", border: "border-gray-200", hoverBorder: "hover:border-gray-300", iconBg: "bg-gray-600", iconText: "text-gray-600", pill: "bg-gray-100 text-gray-800", bg: "bg-gray-50/50" }
};

const PUBLIC_COLOR_MAP = {
  blue: { iconBg: "bg-blue-600", text: "text-blue-600", border: "border-blue-100", hoverBorder: "hover:border-blue-300" },
  emerald: { iconBg: "bg-emerald-600", text: "text-emerald-600", border: "border-emerald-100", hoverBorder: "hover:border-emerald-300" },
  violet: { iconBg: "bg-violet-600", text: "text-violet-600", border: "border-violet-100", hoverBorder: "hover:border-violet-300" },
  amber: { iconBg: "bg-amber-500", text: "text-amber-600", border: "border-amber-100", hoverBorder: "hover:border-amber-300" }
};

const localeMap = { fr: "fr-FR", en: "en-US", de: "de-DE", it: "it-IT", es: "es-ES", ro: "ro-RO" };

const parsePriceToNumber = (rawPrice) => {
  if (rawPrice == null) return null;
  const cleaned = String(rawPrice).replace(/[^0-9,.\-]/g, "").replace(",", ".").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

const groupPricing = (rows = []) => {
  const grouped = {};
  rows.forEach((row) => {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({ id: row.id, service_name: row.service_name, price: row.price, unit: row.unit, position: row.position ?? 0 });
  });
  Object.keys(grouped).forEach((cat) => { grouped[cat].sort((a, b) => a.position - b.position); });
  return grouped;
};

const getServiceIcon = (name = "") => {
  const l = name.toLowerCase();
  if (l.includes("label")) return Tag;
  if (l.includes("polybag") || l.includes("pack")) return Package;
  if (l.includes("storage") || l.includes("pallet")) return Archive;
  if (l.includes("ship") || l.includes("fbm") || l.includes("order")) return Truck;
  if (l.includes("insert") || l.includes("custom")) return Boxes;
  if (l.includes("quality") || l.includes("check")) return Shield;
  return Layers;
};

export default function ServicesPricing() {
  const { currentLanguage } = useLanguage();
  const { t } = useServicesTranslation(currentLanguage);
  const { user, profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const isAdmin = Boolean(profile?.account_type === "admin" || profile?.is_admin === true || user?.user_metadata?.account_type === "admin");
  const canViewPrices = Boolean(isAdmin || profile?.can_view_prices);
  const canManagePricing = isAdmin;

  const [content, setContent] = useState({});
  const [pricingGroups, setPricingGroups] = useState({});
  const [shippingRates, setShippingRates] = useState({ domestic: [], international: {} });
  const [shippingRegion, setShippingRegion] = useState("Germany/Austria");
  const [shippingError, setShippingError] = useState("");
  const [shippingLoading, setShippingLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState("");
  const [serviceSelection, setServiceSelection] = useState("");
  const [estimateItems, setEstimateItems] = useState([]);

  const pricingErrorMessage = t("pricingSection.error");
  const shippingFallbackMessage = t("shippingSection.domesticDisclaimer");

  const formatPriceHt = (value) => {
    const trimmed = (value || "").toString().trim();
    if (!trimmed) return t("pricingSection.contact");
    return trimmed.toUpperCase().includes("HT") ? trimmed : `${trimmed} HT`;
  };

  const getLocalizedContent = useCallback((key, translationKey) => {
    const localizedKey = `${key}_${currentLanguage}`;
    const englishKey = `${key}_en`;
    const localizedValue = content?.[localizedKey]?.trim();
    if (localizedValue) return localizedValue;
    const dictionaryValue = translationKey ? t(translationKey) : "";
    if (dictionaryValue && dictionaryValue !== translationKey) return dictionaryValue;
    const englishValue = content?.[englishKey]?.trim();
    if (englishValue) return englishValue;
    const fallbackValue = content?.[key]?.trim();
    if (fallbackValue) return fallbackValue;
    return dictionaryValue || "";
  }, [content, currentLanguage, t]);

  const heroTitle = canViewPrices ? getLocalizedContent("services_title", "pageTitle") : t("publicSection.pageTitle");
  const heroSubtitle = canViewPrices ? getLocalizedContent("services_subtitle", "pageSubtitle") : t("publicSection.pageSubtitle");

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true); setPricingError("");
    try { const { data, error } = await supabaseHelpers.getPricingServices(currentMarket); if (error) throw error; setPricingGroups(groupPricing(data || [])); }
    catch { setPricingError(pricingErrorMessage); }
    finally { setPricingLoading(false); }
  }, [pricingErrorMessage, currentMarket]);

  const fetchContent = useCallback(async () => { const { data, error } = await supabaseHelpers.getContent(); if (!error) setContent(data || {}); }, []);

  const fetchShipping = useCallback(async () => {
    setShippingLoading(true); setShippingError("");
    try {
      const { data, error } = await supabaseHelpers.getFbmShippingRates(); if (error) throw error;
      const domestic = []; const international = {};
      (data || []).forEach((row) => { const entry = { id: row.id, provider: row.provider, info: row.info || "", color: row.color || "", rates: row.rates || {} }; if (row.category === "domestic") domestic.push(entry); else { if (!international[row.region]) international[row.region] = []; international[row.region].push(entry); } });
      setShippingRates({ domestic, international });
    } catch { setShippingError(shippingFallbackMessage); }
    finally { setShippingLoading(false); }
  }, [shippingFallbackMessage]);

  useEffect(() => {
    if (canViewPrices) fetchPricing(); else { setPricingGroups({}); setPricingError(""); setPricingLoading(false); }
    fetchContent(); fetchShipping();
  }, [fetchPricing, fetchContent, fetchShipping, canViewPrices]);

  useEffect(() => {
    if (canViewPrices || currentLanguage !== "en") return;
    document.title = "Prep, Fulfillment & Storage Services in France | PrepCenter";
    let meta = document.querySelector("meta[name=\"description\"]");
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", "Fast reception, labeling, quality checks, order fulfillment and storage in France. Flexible workflows, quick turnaround and tailored quotes.");
  }, [canViewPrices, currentLanguage]);

  const sections = useMemo(() => {
    const manual = CATEGORY_ORDER.filter((e) => pricingGroups[e.id]?.length);
    const other = Object.keys(pricingGroups).filter((c) => !CATEGORY_ORDER.some((e) => e.id === c));
    return [...manual, ...other.map((c) => ({ id: c, key: "custom" }))].map((e) => ({ ...e, items: pricingGroups[e.id] || [] }));
  }, [pricingGroups]);

  const calculatorSections = useMemo(() => sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, normalizedName: (i.service_name || "").toLowerCase(), numericPrice: parsePriceToNumber(i.price), sectionId: s.id })) })), [sections]);
  const serviceLookup = useMemo(() => { const l = {}; calculatorSections.forEach((s) => s.items.forEach((i) => { l[i.id] = i; })); return l; }, [calculatorSections]);
  const visibleServiceGroups = calculatorSections;
  const hasServiceResults = visibleServiceGroups.some((s) => s.items.length > 0);

  useEffect(() => { if (!hasServiceResults) { setServiceSelection(""); return; } setServiceSelection((p) => { const exists = visibleServiceGroups.some((s) => s.items.some((i) => i.id === p)); return exists ? p : ""; }); }, [visibleServiceGroups, hasServiceResults]);

  const periodMap = useMemo(() => PERIOD_OPTIONS.reduce((a, o) => { a[o.id] = o; return a; }, {}), []);
  const defaultPeriodForService = useCallback((s) => s?.sectionId === "Storage" ? PERIOD_OPTIONS[0]?.id || "1m" : "1m", []);

  const addServiceToEstimate = useCallback((serviceId, overridePeriodId = null) => {
    if (!serviceId) return;
    const service = serviceLookup[serviceId];
    const periodId = overridePeriodId || defaultPeriodForService(service);
    setEstimateItems((prev) => { const next = [...prev]; const idx = next.findIndex((e) => e.serviceId === serviceId && e.periodId === periodId); if (idx >= 0) next[idx] = { ...next[idx], qty: (next[idx].qty || 1) + 1 }; else next.push({ serviceId, periodId, qty: 1 }); return next; });
  }, [serviceLookup, defaultPeriodForService]);

  const handleServiceSelection = (id) => { if (!id) return; addServiceToEstimate(id); setServiceSelection(""); };

  const estimateSummary = useMemo(() => estimateItems.map((item) => {
    const service = serviceLookup[item.serviceId]; if (!service) return null;
    const qty = Math.max(1, Number(item.qty) || 1);
    const isStorage = service.sectionId === "Storage"; const isCustom = isStorage && item.periodId === "custom";
    const periodOption = periodMap[item.periodId] || periodMap["1m"];
    const customMonths = isCustom ? Math.max(1, Number(item.customPeriodMonths) || 1) : null;
    const multiplier = customMonths ?? periodOption?.multiplier ?? 1;
    const displayLabel = isCustom ? t("calculator.customPeriodLabel", { months: multiplier }) : t(`calculator.periodOptions.${periodOption?.labelKey || "oneMonth"}`);
    const lineTotal = service.numericPrice == null ? null : service.numericPrice * qty * multiplier;
    return { ...item, qty, service, period: { id: isCustom ? "custom" : periodOption?.id || "1m", labelKey: isCustom ? "other" : periodOption?.labelKey || "oneMonth", multiplier, displayLabel }, customPeriodMonths: customMonths, lineTotal };
  }).filter(Boolean), [estimateItems, serviceLookup, periodMap, t]);

  const calculatorTotal = useMemo(() => estimateSummary.reduce((s, i) => i.lineTotal == null ? s : s + i.lineTotal, 0), [estimateSummary]);

  const handleEstimateQtyChange = (sid, pid, val) => { const n = Math.max(1, Number(val) || 1); setEstimateItems((p) => p.map((e) => e.serviceId === sid && e.periodId === pid ? { ...e, qty: n } : e)); };
  const handleEstimatePeriodChange = (sid, cpid, npid) => { if (!npid || cpid === npid) return; setEstimateItems((p) => { const ci = p.findIndex((e) => e.serviceId === sid && e.periodId === cpid); if (ci === -1) return p; const n = [...p]; const di = n.findIndex((e, i) => i !== ci && e.serviceId === sid && e.periodId === npid); if (di >= 0) { n[di] = { ...n[di], qty: (n[di].qty || 1) + (n[ci].qty || 1) }; n.splice(ci, 1); } else n[ci] = { ...n[ci], periodId: npid, customPeriodMonths: null }; return n; }); };
  const handleActivateCustomPeriod = (sid, cpid, months = 12) => { const n = Math.max(1, Number(months) || 1); setEstimateItems((p) => p.map((e) => e.serviceId === sid && e.periodId === cpid ? { ...e, periodId: "custom", customPeriodMonths: n } : e)); };
  const handleCustomPeriodMonthsChange = (sid, val) => { const n = Math.max(1, Number(val) || 1); setEstimateItems((p) => p.map((e) => e.serviceId === sid && e.periodId === "custom" ? { ...e, customPeriodMonths: n } : e)); };
  const handleRemoveEstimateLine = (sid, pid) => setEstimateItems((p) => p.filter((e) => !(e.serviceId === sid && e.periodId === pid)));

  const currencyFormatter = useMemo(() => new Intl.NumberFormat(localeMap[currentLanguage] || "en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }), [currentLanguage]);
  const handleClearCalculator = () => setEstimateItems([]);

  const handleBundleExport = async ({ title, categories, filename }) => {
    if (!Object.keys(pricingGroups).length) { setPricingError(t("pricingSection.error")); return; }
    try { await exportPricingBundlePdf({ title, categories, groups: pricingGroups, filename }); }
    catch { setPricingError(t("pricingSection.error")); }
  };

  const sectionCtas = useMemo(() => ({ fba: { label: t("pricingSection.ctaFba"), href: "/contact" }, fbm: { label: t("pricingSection.ctaFbm"), href: "/contact" }, storage: { label: t("pricingSection.ctaStorage"), href: "/contact" }, extra: { label: t("pricingSection.ctaExtra"), href: "/contact" } }), [t]);
  const translatedDescription = t("pricingSection.description");
  const sectionDescription = translatedDescription && translatedDescription !== "pricingSection.description" ? translatedDescription : "";

  const publicGroups = useMemo(() => PUBLIC_GROUPS.map((g) => ({ ...g, title: t(`publicSection.groups.${g.key}.title`), subtitle: t(`publicSection.groups.${g.key}.subtitle`), bullets: t(`publicSection.groups.${g.key}.bullets`) })), [t]);
  const publicBadge = t("publicSection.heroBadge");
  const publicHighlights = useMemo(() => { const v = t("publicSection.highlights"); return Array.isArray(v) ? v : []; }, [t]);

  /* ── shipping renderers ── */
  const renderShippingRow = (row, columns) => {
    const p = PROVIDER_BADGES[row.provider] || { bg: row.color || "transparent", text: "#111827" };
    return (
      <tr key={row.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ backgroundColor: p.bg }}>
        <td className="px-5 py-4 text-lg font-semibold" style={{ color: p.text }}>{row.provider}</td>
        {columns.map((col) => (<td key={col} className="px-5 py-4 text-center text-lg font-light">{row.rates?.[col] || "—"}</td>))}
        <td className="px-5 py-4 text-lg text-text-secondary font-light">{row.info || "—"}</td>
      </tr>
    );
  };

  const renderShippingCards = (rows, columns) => (
    <div className="md:hidden space-y-4">
      {rows.map((row) => {
        const p = PROVIDER_BADGES[row.provider] || { bg: row.color || "#F8FAFC", text: "#111827" };
        return (
          <article key={row.id} className="rounded-md border shadow-sm p-5" style={{ backgroundColor: p.bg }}>
            <p className="text-lg font-semibold" style={{ color: p.text }}>{row.provider}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {columns.map((col) => (
                <div key={col}>
                  <p className="text-lg text-text-light">{col.includes("kg") ? col : `${col} kg`}</p>
                  <p className="text-lg font-semibold text-text-primary">{row.rates?.[col] || "—"}</p>
                </div>
              ))}
            </div>
            {row.info && <p className="mt-3 text-lg text-text-secondary font-light">{row.info}</p>}
          </article>
        );
      })}
    </div>
  );

  return (
    <div id="services_root" className="min-h-screen">
      {/* ===== HERO ===== */}
      <section id="services_hero" className="relative overflow-hidden bg-[#060d19] pt-28 pb-20 lg:pt-36 lg:pb-28">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-blue-600/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-violet-600/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-primary/3 rounded-full blur-[150px]" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 mb-8 backdrop-blur-md">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-lg text-white/60 font-medium">{publicBadge}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white mb-6 leading-[1.08] tracking-tight" style={{ textWrap: "balance" }}>
              {heroTitle}
            </h1>
            <p className="text-xl text-white/45 mb-10 max-w-2xl leading-relaxed font-light">
              {heroSubtitle}
            </p>
            {publicHighlights.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {publicHighlights.map((item) => (
                  <span key={item} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-lg text-white/50 font-light backdrop-blur-sm">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* ===== PUBLIC SERVICE GROUPS (non-auth) ===== */}
      {!canViewPrices && (
        <section id="services_public_groups" className="py-20 lg:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeIn>
              <div className="text-center mb-16">
                <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Services</p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary mb-5" style={{ textWrap: "balance" }}>{t("publicSection.pageTitle")}</h2>
                <p className="text-xl text-text-secondary max-w-2xl mx-auto font-light">{t("publicSection.pageSubtitle")}</p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
              {publicGroups.map((group, i) => {
                const Icon = group.icon;
                const bullets = Array.isArray(group.bullets) ? group.bullets : [];
                const colors = PUBLIC_COLOR_MAP[group.color];
                return (
                  <FadeIn key={group.key} delay={i * 120}>
                    <div className={`group relative bg-white rounded-md border ${colors.border} ${colors.hoverBorder} hover:shadow-xl transition-all duration-500 overflow-hidden h-full flex flex-col`}>
                      <div className={`h-1 ${colors.iconBg}`} />
                      <div className="p-8 flex flex-col flex-1">
                        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-md ${colors.iconBg} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className="w-7 h-7 text-white" />
                        </div>
                        <h3 className="text-xl font-semibold text-text-primary mb-2">{group.title}</h3>
                        <p className="text-lg text-text-secondary mb-6 leading-relaxed font-light">{group.subtitle}</p>
                        {bullets.length > 0 && (
                          <ul className="space-y-3 flex-1">
                            {bullets.map((item) => (
                              <li key={item} className="flex items-start gap-3">
                                <CheckCircle className={`w-5 h-5 ${colors.text} flex-shrink-0 mt-0.5`} />
                                <span className="text-lg text-text-secondary font-light">{item}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </FadeIn>
                );
              })}
            </div>

            <FadeIn delay={500}>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
                <a href="/contact" className="group inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-md font-semibold text-lg hover:bg-primary-dark transition-all duration-300 shadow-lg shadow-primary/20">
                  {t("publicSection.ctaPrimary")}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                </a>
                <a href="https://wa.me/33675116218" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-8 py-4 rounded-md font-semibold text-lg hover:bg-[#1ebe5d] transition-all duration-300 shadow-lg shadow-[#25D366]/20">
                  {t("publicSection.ctaSecondary")}
                </a>
              </div>
              <p className="text-lg text-text-light text-center mt-6 font-light">{t("publicSection.note")}</p>
            </FadeIn>
          </div>
        </section>
      )}

      {/* ===== PRICING SECTIONS (auth) ===== */}
      {canViewPrices && (
        <section id="services_pricing" className="py-20 lg:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeIn>
              <div className="max-w-3xl mb-16">
                <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">Pricing</p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-text-primary mb-5">{t("pricingSection.title")}</h2>
                {sectionDescription && <p className="text-xl text-text-secondary font-light">{sectionDescription}</p>}
              </div>
            </FadeIn>

            {pricingError && <div className="px-5 py-4 bg-red-50 border border-red-100 rounded-md text-lg text-red-700 mb-8">{pricingError}</div>}

            {pricingLoading ? (
              <div className="py-20 text-center text-lg text-text-secondary font-light">{t("pricingSection.loading")}</div>
            ) : sections.length === 0 ? (
              <div className="py-20 text-center text-lg text-text-secondary font-light">{t("pricingSection.empty")}</div>
            ) : (
              <div className="space-y-10">
                {sections.map((section, sIdx) => {
                  const colors = SECTION_COLORS[section.key] || SECTION_COLORS.custom;
                  const cta = sectionCtas[section.key];
                  return (
                    <FadeIn key={section.id} delay={sIdx * 100}>
                      <div className="bg-white rounded-md border border-gray-100 hover:shadow-xl transition-all duration-500 overflow-hidden">
                        <div className={`h-1.5 ${colors.accent}`} />
                        <div className="p-8 space-y-8">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div>
                              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-lg font-semibold uppercase tracking-wide ${colors.pill}`}>
                                {t(`pricingSection.groups.${section.key}.title`) || section.id}
                              </span>
                              <h2 className="mt-3 text-2xl lg:text-3xl font-semibold text-text-primary">{section.id}</h2>
                              <p className="text-lg text-text-secondary mt-1 font-light">{t(`pricingSection.groups.${section.key}.subtitle`) || section.id}</p>
                            </div>
                            {cta && (
                              <a href={cta.href} className="group inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-white font-semibold text-lg hover:bg-primary-dark transition-all duration-300 shadow-lg shadow-primary/20 self-start">
                                {cta.label}
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                              </a>
                            )}
                          </div>

                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {section.items.map((item) => {
                              const Icon = getServiceIcon(item.service_name);
                              return (
                                <div key={item.id} className={`group flex gap-4 rounded-md bg-white border ${colors.border} ${colors.hoverBorder} p-5 hover:shadow-lg transition-all duration-500`}>
                                  <div className={`shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-md ${colors.iconBg} group-hover:scale-110 transition-transform duration-300`}>
                                    <Icon className="w-6 h-6 text-white" />
                                  </div>
                                  <div>
                                    <p className="text-lg font-semibold text-text-primary">{item.service_name}</p>
                                    <p className="text-lg text-text-secondary font-light">
                                      {formatPriceHt(item.price)}
                                      <span className="text-lg text-text-light"> / {item.unit}</span>
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </FadeIn>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===== PDF EXPORT (admin dark section) ===== */}
      {canViewPrices && (
        <section id="services_export" className="relative overflow-hidden py-20 lg:py-24 bg-[#060d19]">
          <div className="absolute inset-0">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-500/8 rounded-full blur-[120px]" />
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeIn>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                <div>
                  <h2 className="text-3xl sm:text-4xl font-semibold text-white mb-3">{t("pricingSection.finalTitle")}</h2>
                  <p className="text-xl text-white/40 font-light max-w-xl">{t("pricingSection.finalNote")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {canManagePricing && (
                    <a href="/admin?tab=pricing" className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-md border border-white/20 text-white font-semibold text-lg hover:border-white/50 transition-all duration-300">
                      <Settings className="w-5 h-5" /> {t("pricingSection.manage")}
                    </a>
                  )}
                  <button onClick={() => handleBundleExport({ title: CATEGORY_ORDER[0].id, categories: ["FBA Prep Services", "Extra Services", "Storage"], filename: "FBA-Prep-Services.pdf" })} className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-md bg-white text-gray-900 font-semibold text-lg hover:bg-gray-100 transition-all duration-300 shadow-lg">
                    <FileDown className="w-5 h-5" /> {t("pricingSection.exportFba")}
                  </button>
                  <button onClick={() => handleBundleExport({ title: CATEGORY_ORDER[1].id, categories: ["FBM Fulfillment", "Extra Services", "Storage"], filename: "FBM-Fulfillment.pdf" })} className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-md border border-white/30 text-white font-semibold text-lg hover:border-white transition-all duration-300">
                    <FileDown className="w-5 h-5" /> {t("pricingSection.exportFbm")}
                  </button>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>
      )}

      {/* ===== SHIPPING ===== */}
      <section id="services_shipping" className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* Domestic */}
          <FadeIn>
            <div className="bg-white rounded-md border border-gray-100 hover:shadow-xl transition-all duration-500 overflow-hidden">
              <div className="h-1 bg-emerald-600" />
              <div className="p-8 space-y-6">
                <div>
                  <p className="text-lg font-semibold text-emerald-600 mb-2 uppercase tracking-widest">Domestic</p>
                  <h2 className="text-2xl lg:text-3xl font-semibold text-text-primary">{t("shippingSection.domesticTitle")}</h2>
                  <p className="text-lg text-text-secondary font-light mt-1">{t("shippingSection.domesticSubtitle")}</p>
                </div>
                {shippingLoading ? (
                  <div className="py-10 text-center text-lg text-text-secondary font-light">{t("pricingSection.loading")}</div>
                ) : (
                  <>
                    {renderShippingCards(shippingRates.domestic, DOMESTIC_COLUMNS)}
                    <div className="hidden md:block overflow-auto border rounded-md">
                      <table className="min-w-full text-lg">
                        <thead className="bg-gray-50 text-text-secondary">
                          <tr>
                            <th className="px-5 py-4 text-left font-semibold">{t("shippingSection.table.transporter")}</th>
                            {DOMESTIC_COLUMNS.map((col) => (<th key={col} className="px-5 py-4 text-center font-semibold">{col === "20" ? "20 kg" : `${col} kg`}</th>))}
                            <th className="px-5 py-4 text-left font-semibold">{t("shippingSection.table.info")}</th>
                          </tr>
                        </thead>
                        <tbody>{shippingRates.domestic.map((row) => renderShippingRow(row, DOMESTIC_COLUMNS))}</tbody>
                      </table>
                    </div>
                  </>
                )}
                <p className="text-lg text-text-light font-light">{t("shippingSection.domesticDisclaimer")}</p>
              </div>
            </div>
          </FadeIn>

          {/* International */}
          <FadeIn delay={150}>
            <div className="bg-white rounded-md border border-gray-100 hover:shadow-xl transition-all duration-500 overflow-hidden">
              <div className="h-1 bg-blue-600" />
              <div className="p-8 space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-blue-600 mb-2 uppercase tracking-widest">International</p>
                    <h2 className="text-2xl lg:text-3xl font-semibold text-text-primary">{t("shippingSection.internationalTitle")}</h2>
                    <p className="text-lg text-text-secondary font-light mt-1">{t("shippingSection.internationalSubtitle")}</p>
                  </div>
                  <select value={shippingRegion} onChange={(e) => setShippingRegion(e.target.value)} className="border border-gray-200 rounded-md px-5 py-3 text-lg focus:ring-2 focus:ring-primary focus:border-primary" aria-label={t("shippingSection.dropdownLabel")}>
                    {Object.keys(INTERNATIONAL_COLUMNS).map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                </div>
                {shippingLoading ? (
                  <div className="py-10 text-center text-lg text-text-secondary font-light">{t("pricingSection.loading")}</div>
                ) : (
                  <>
                    {renderShippingCards(shippingRates.international[shippingRegion] || [], INTERNATIONAL_COLUMNS[shippingRegion] || [])}
                    <div className="hidden md:block overflow-auto border rounded-md">
                      <table className="min-w-full text-lg">
                        <thead className="bg-gray-50 text-text-secondary">
                          <tr>
                            <th className="px-5 py-4 text-left font-semibold">{t("shippingSection.table.transporter")}</th>
                            {(INTERNATIONAL_COLUMNS[shippingRegion] || []).map((col) => (<th key={col} className="px-5 py-4 text-center font-semibold">{col} kg</th>))}
                            <th className="px-5 py-4 text-left font-semibold">{t("shippingSection.table.info")}</th>
                          </tr>
                        </thead>
                        <tbody>{(shippingRates.international[shippingRegion] || []).map((row) => renderShippingRow(row, INTERNATIONAL_COLUMNS[shippingRegion] || []))}</tbody>
                      </table>
                    </div>
                  </>
                )}
                {shippingError && <div className="text-lg text-red-500">{shippingError}</div>}
                <p className="text-lg text-text-light font-light">{t("shippingSection.internationalDisclaimer")}</p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ===== CALCULATOR (auth only) ===== */}
      {canViewPrices && (
        <section id="services_calculator" className="py-20 lg:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeIn>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-12">
                <div>
                  <p className="text-lg font-semibold text-primary mb-4 uppercase tracking-widest">{t("calculator.title")}</p>
                  <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-3">{t("calculator.subtitle")}</h2>
                  <p className="text-lg text-text-secondary font-light">{t("calculator.selectorsHint")}</p>
                </div>
                <div className="text-left lg:text-right">
                  <p className="text-lg uppercase text-text-light tracking-wide">{t("calculator.totalLabel")}</p>
                  <p className="text-4xl font-bold text-primary">{currencyFormatter.format(calculatorTotal || 0)}</p>
                </div>
              </div>
            </FadeIn>

            {calculatorSections.length === 0 ? (
              <div className="py-20 text-center text-lg text-text-secondary font-light">{t("calculator.empty")}</div>
            ) : (
              <FadeIn delay={100}>
                <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
                  <div className="space-y-6">
                    <div className="rounded-md border bg-gray-50/80 p-6 space-y-4 shadow-inner">
                      <label className="text-lg uppercase text-text-light tracking-wide font-semibold">{t("calculator.categoryLabel")}</label>
                      <select value={serviceSelection} onChange={(e) => handleServiceSelection(e.target.value)} disabled={!hasServiceResults} className="block w-full rounded-md border px-4 py-3 text-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100">
                        {hasServiceResults ? (
                          <>
                            <option value="" disabled>{t("calculator.pickerPlaceholder")}</option>
                            {visibleServiceGroups.map((section) => (
                              <optgroup key={section.id} label={t(`pricingSection.groups.${section.key}.title`) || section.id}>
                                {section.items.map((service) => (
                                  <option key={service.id} value={service.id}>{`${service.service_name} — ${service.price ?? t("calculator.priceUnavailable")} / ${service.unit}`}</option>
                                ))}
                              </optgroup>
                            ))}
                          </>
                        ) : (
                          <option value="">{t("calculator.noResults")}</option>
                        )}
                      </select>
                    </div>

                    {estimateSummary.length === 0 ? (
                      <div className="rounded-md border border-dashed bg-white p-8 text-lg text-text-secondary text-center font-light">{t("calculator.emptySelection")}</div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {estimateSummary.map((item) => (
                          <div key={`${item.service.id}-${item.period.id}`} className="relative rounded-md border bg-white p-4 shadow-sm flex flex-col gap-2 min-h-[140px] hover:shadow-lg transition-all duration-300">
                            <button type="button" aria-label={t("calculator.remove")} onClick={() => handleRemoveEstimateLine(item.service.id, item.period.id)} className="absolute top-3 right-3 text-text-light hover:text-text-primary text-lg">x</button>
                            <div className="space-y-1 pr-6">
                              <p className="font-semibold text-text-primary text-lg leading-tight">{item.service.service_name}</p>
                              <p className="text-lg text-text-light">{item.service.sectionId} / {item.period.displayLabel}</p>
                              <p className="text-lg text-text-secondary">{item.service.price == null ? t("calculator.priceUnavailable") : `${formatPriceHt(item.service.price)} / ${item.service.unit}`}</p>
                            </div>
                            {item.service.sectionId === "Storage" && (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {PERIOD_OPTIONS.map((o) => (<button type="button" key={o.id} onClick={() => handleEstimatePeriodChange(item.service.id, item.period.id, o.id)} className={`px-2.5 py-1 rounded-full text-lg border transition ${item.period.id === o.id ? "bg-primary text-white border-primary" : "bg-white text-text-secondary border-gray-200 hover:border-primary"}`}>{t(`calculator.periodOptions.${o.labelKey}`)}</button>))}
                                  <button type="button" onClick={() => handleActivateCustomPeriod(item.service.id, item.period.id)} className={`px-2.5 py-1 rounded-full text-lg border transition ${item.period.id === "custom" ? "bg-primary text-white border-primary" : "bg-white text-text-secondary border-gray-200 hover:border-primary"}`}>{t("calculator.periodOptions.other")}</button>
                                </div>
                                {item.period.id === "custom" && (
                                  <div className="flex items-center gap-2">
                                    <input type="number" min="1" value={item.customPeriodMonths || ""} onChange={(e) => handleCustomPeriodMonthsChange(item.service.id, e.target.value)} className="w-20 rounded-md border px-2 py-1 text-lg" placeholder={t("calculator.customPeriodPlaceholder")} />
                                    <span className="text-lg text-text-light">{t("calculator.customPeriodHint")}</span>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-auto">
                              <span className="text-lg uppercase text-text-light">{t("calculator.quantity")}</span>
                              <input id={`qty-${item.service.id}-${item.period.id}`} type="number" min="1" value={item.qty} onChange={(e) => handleEstimateQtyChange(item.service.id, item.period.id, e.target.value)} className="w-16 rounded-md border px-2 py-1 text-lg text-center" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <aside className="bg-[#060d19] text-white rounded-md p-6 space-y-5 shadow-xl lg:sticky lg:top-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-lg uppercase text-white/50">{t("calculator.totalLabel")}</p>
                        <p className="text-3xl font-semibold">{currencyFormatter.format(calculatorTotal || 0)}</p>
                      </div>
                      {estimateSummary.length > 0 && (
                        <button type="button" onClick={handleClearCalculator} className="text-lg underline decoration-dotted text-white/80 hover:text-white">{t("calculator.clearAll")}</button>
                      )}
                    </div>
                    <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                      {estimateSummary.length === 0 ? (
                        <p className="text-lg text-white/70 font-light">{t("calculator.emptySelection")}</p>
                      ) : (
                        estimateSummary.map((item) => (
                          <div key={`${item.service.id}-${item.period.id}`} className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                            <div>
                              <p className="text-lg font-semibold">{item.service.service_name}</p>
                              <p className="text-lg text-white/60 font-light">{item.service.sectionId} / {item.period.displayLabel}</p>
                              <p className="text-lg text-white/60 font-light">{item.qty} x {item.service.price == null ? t("calculator.priceUnavailable") : `${formatPriceHt(item.service.price)} / ${item.service.unit}`}</p>
                            </div>
                            <p className="text-lg font-semibold">{item.lineTotal == null ? t("calculator.priceUnavailable") : currencyFormatter.format(item.lineTotal)}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <p className="text-lg text-white/50 font-light">{t("calculator.note")}</p>
                  </aside>
                </div>
              </FadeIn>
            )}
          </div>
        </section>
      )}

      {/* ===== CTA ===== */}
      <section id="services_cta" className="relative overflow-hidden py-20 lg:py-28 bg-[#060d19]">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-500/8 rounded-full blur-[120px]" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-7 leading-tight" style={{ textWrap: "balance" }}>
              {canViewPrices ? t("pricingSection.finalTitle") : t("publicSection.pageTitle")}
            </h2>
            <p className="text-xl text-white/40 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
              {canViewPrices ? t("pricingSection.finalNote") : t("publicSection.note")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a href="/contact" className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-[#060d19] px-10 py-4 rounded-md font-semibold text-lg hover:bg-gray-100 transition-all duration-300 shadow-lg">
                {t("publicSection.ctaPrimary")}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
              </a>
              <a href="https://wa.me/33675116218" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-10 py-4 rounded-md font-semibold text-lg hover:bg-[#1ebe5d] transition-all duration-300 shadow-lg shadow-[#25D366]/20">
                {t("publicSection.ctaSecondary")}
              </a>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
