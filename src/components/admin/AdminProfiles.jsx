// FILE: src/components/admin/AdminProfiles.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseHelpers } from "@/config/supabase";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  Search,
} from "lucide-react";
import { useAdminTranslation } from "@/i18n/useAdminTranslation";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { useMarket } from "@/contexts/MarketContext";
import { normalizeMarketCode } from "@/utils/market";

const PER_PAGE = 30;
const fmt2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

// --- date helpers (LOCAL, fără UTC drift)
function firstDayOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastDayOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d, n) { const nd = new Date(d); nd.setMonth(nd.getMonth() + n); return nd; }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
const sumLineRows = (rows = [], qtyField = "units") =>
  (rows || []).reduce((acc, row) => {
    const total =
      row?.total != null
        ? Number(row.total)
        : Number(row?.unit_price || 0) * Number(row?.[qtyField] || 0);
    return acc + (Number.isFinite(total) ? total : 0);
  }, 0);

const sumOtherLineRows = (rows = []) => sumLineRows(rows, "units");

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchOtherLineSums(companyId, startDate, endDate, market) {

  if (!companyId) {
    return { monthTotal: 0, carryTotal: 0 };
  }
  const marketCode = normalizeMarketCode(market);
  const withCountry = (query) =>
    marketCode ? query.eq('country', marketCode) : query;
  const [{ data: monthRows, error: monthErr }, { data: prevRows, error: prevErr }] = await Promise.all([
    withCountry(
      supabase
        .from("other_lines")
        .select("total, unit_price, units, service_date")
        .eq("company_id", companyId)
    )
      .gte("service_date", startDate)
      .lte("service_date", endDate),
    withCountry(
      supabase
        .from("other_lines")
        .select("total, unit_price, units, service_date")
        .eq("company_id", companyId)
    )
      .lt("service_date", startDate)
  ]);
  if (monthErr || prevErr) {
    return { monthTotal: 0, carryTotal: 0 };
  }
  return {
    monthTotal: sumOtherLineRows(monthRows),
    carryTotal: sumOtherLineRows(prevRows)
  };
}

async function fetchServiceLineSums(companyId, startDate, endDate, market) {
  if (!companyId) return { current: 0, carry: 0 };
  const marketCode = normalizeMarketCode(market);
  const withCountry = (query) =>
    marketCode ? query.eq('country', marketCode) : query;

  const [fbaMonth, fbaPrev, fbmMonth, fbmPrev] = await Promise.all([
    withCountry(
      supabase
        .from('fba_lines')
        .select('total, unit_price, units, service_date')
        .eq('company_id', companyId)
        .gte('service_date', startDate)
        .lte('service_date', endDate)
    ),
    withCountry(
      supabase
        .from('fba_lines')
        .select('total, unit_price, units, service_date')
        .eq('company_id', companyId)
        .lt('service_date', startDate)
    ),
    withCountry(
      supabase
        .from('fbm_lines')
        .select('total, unit_price, orders_units, service_date')
        .eq('company_id', companyId)
        .gte('service_date', startDate)
        .lte('service_date', endDate)
    ),
    withCountry(
      supabase
        .from('fbm_lines')
        .select('total, unit_price, orders_units, service_date')
        .eq('company_id', companyId)
        .lt('service_date', startDate)
    )
  ]);

  if (fbaMonth.error || fbaPrev.error || fbmMonth.error || fbmPrev.error) {
    return { current: 0, carry: 0 };
  }

  const current =
    sumLineRows(fbaMonth.data, 'units') +
    sumLineRows(fbmMonth.data, 'orders_units');
  const carry =
    sumLineRows(fbaPrev.data, 'units') +
    sumLineRows(fbmPrev.data, 'orders_units');

  return { current, carry };
}

const getBalanceState = (value) => {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return "neutral";
  return value > 0 ? "overdue" : "advance";
};

// --- UI
function MoneyPill({ value }) {
  const numeric = Number(value);
  const state = getBalanceState(numeric);
  const isZero = state === "neutral";
 const cls =
    state === "advance"
      ? "bg-green-100 text-green-800"
     : state === "overdue"
      ? "bg-red-100 text-red-800"
      : "bg-gray-100 text-gray-700";
  const display = isZero ? "0.00" : numeric.toFixed(2);
  return (
    <span className={`px-2 py-1 rounded-md text-sm font-medium ${cls}`}>
      {display}
    </span>
  );
}


const STORAGE_KEY = 'admin-clients-filters';
const BALANCE_FILTERS = ["all", "advance", "overdue"];

export default function AdminProfiles({ onSelect }) {
  const { t, tp } = useAdminTranslation();
  const { profile: currentProfile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const isLimitedAdmin = Boolean(currentProfile?.is_limited_admin);
  const showBalances = !isLimitedAdmin;
  const [persistedFilters, setPersistedFilters] = useSessionStorage(STORAGE_KEY, {
    selectedMonth: monthKey(new Date()),
    showEmail: false,
    showPhone: false,
    showPricing: true,
    from: isoLocal(firstDayOfMonth(new Date())),
    to: isoLocal(lastDayOfMonth(new Date())),
    q: '',
    page: 1,
    restFilter: 'all',
    sortKey: 'current',
    sortDir: 'desc'
  });
  // month selector
  const [selectedMonth, setSelectedMonth] = useState(persistedFilters.selectedMonth || monthKey(new Date()));
  const [showEmail, setShowEmail] = useState(!!persistedFilters.showEmail);
  const [showPhone, setShowPhone] = useState(!!persistedFilters.showPhone);
  const [showPricing, setShowPricing] = useState(
    persistedFilters.showPricing === undefined ? true : !!persistedFilters.showPricing
  );
  const [from, setFrom] = useState(persistedFilters.from || isoLocal(firstDayOfMonth(new Date())));
  const [to, setTo] = useState(persistedFilters.to || isoLocal(lastDayOfMonth(new Date())));
  const gotoMonth = (delta) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const nd = addMonths(new Date(y, m - 1, 1), delta);
    setSelectedMonth(monthKey(nd));
    setFrom(isoLocal(firstDayOfMonth(nd)));
    setTo(isoLocal(lastDayOfMonth(nd)));
  };

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(persistedFilters.q || "");
  const [page, setPage] = useState(persistedFilters.page || 1);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState(persistedFilters.sortKey || "current");
  const [sortDir, setSortDir] = useState(persistedFilters.sortDir || "desc");

  // per-row computed (valori direct din RPC)
  const [calc, setCalc] = useState({});
  const [restFilter, setRestFilter] = useState(
    BALANCE_FILTERS.includes(persistedFilters.restFilter) ? persistedFilters.restFilter : "all"
  );
  const [editingStoreId, setEditingStoreId] = useState(null);
  const [storeDraft, setStoreDraft] = useState("");
  const [storeBanner, setStoreBanner] = useState("");
  const [priceToggleSaving, setPriceToggleSaving] = useState({});

  useEffect(() => {
    setPersistedFilters({
      selectedMonth,
      showEmail,
      showPhone,
      showPricing,
      from,
      to,
      q,
      page,
      restFilter,
      sortKey,
      sortDir
    });
  }, [
    selectedMonth,
    showEmail,
    showPhone,
    showPricing,
    from,
    to,
    q,
    page,
    restFilter,
    sortKey,
    sortDir,
    setPersistedFilters
  ]);

  useEffect(() => {
    if (!showBalances && restFilter !== "all") {
      setRestFilter("all");
    }
  }, [showBalances, restFilter]);

  useEffect(() => {
    if (!storeBanner) return;
    const timer = setTimeout(() => setStoreBanner(""), 4000);
    return () => clearTimeout(timer);
  }, [storeBanner]);

  // Perioada RPC calculată (vizibilă pe pagină)
  const enrichProfile = (profile, billingMap) => {
    const billingList = billingMap.get(profile.id) || [];
    const billingFallback =
      billingList.find((b) => b.is_default) || billingList[0] || {};
    const firstName = profile.first_name || billingFallback?.first_name || null;
    const lastName = profile.last_name || billingFallback?.last_name || null;
    const companyName =
      profile.company_name || billingFallback?.company_name || null;
    return {
      ...profile,
      display_first_name: firstName,
      display_last_name: lastName,
      display_company_name: companyName
    };
  };

  const reloadProfiles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,phone,first_name,last_name,company_name,created_at,account_type,company_id,store_name,can_view_prices,country,allowed_markets")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const nonAdmins = (data || []).filter(
        (r) => (r.account_type || "").toLowerCase() !== "admin"
      );
      const marketCode = normalizeMarketCode(currentMarket);
      const scoped = marketCode
        ? nonAdmins.filter((r) => {
            const allowed = Array.isArray(r.allowed_markets) ? r.allowed_markets : [];
            const normalizedAllowed = allowed.map((c) => normalizeMarketCode(c));
            return normalizedAllowed.includes(marketCode);
          })
        : nonAdmins;

      let billingMap = new Map();
      const ids = nonAdmins.map((r) => r.id).filter(Boolean);
      if (ids.length) {
        const { data: billingRows, error: billingError } = await supabase
          .from("billing_profiles")
          .select("user_id, first_name, last_name, company_name, is_default")
          .in("user_id", ids);
        if (billingError) console.error("billing_profiles load failed", billingError);
        (billingRows || []).forEach((row) => {
          if (!row?.user_id) return;
          if (!billingMap.has(row.user_id)) billingMap.set(row.user_id, []);
          billingMap.get(row.user_id).push(row);
        });
      }

      const enriched = scoped.map((profile, idx) => ({
        ...enrichProfile(profile, billingMap),
        _order: idx
      }));

      setRows(enriched);
      setCalc({});
    } catch (e) {
      setRows([]);
      setError(e?.message || "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [currentMarket]);

  useEffect(() => {
    reloadProfiles();
  }, [reloadProfiles]);

  // search results (without live balance filters)
  const searchedRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    const phoneTerm = term.replace(/[^0-9+]/g, "");
    return rows.filter((r) => {
      const nameFields = [
        r.display_first_name || r.first_name || "",
        r.display_last_name || r.last_name || "",
        r.display_company_name || r.company_name || "",
        r.store_name || "",
        r.company_id || "",
        r.email || ""
      ];
      if (nameFields.some((value) => value.toLowerCase().includes(term))) return true;
      const phoneValue = r.phone || "";
      if (phoneValue.toLowerCase().includes(term)) return true;
      if (phoneTerm) {
        const digits = phoneValue.replace(/[^0-9+]/g, "");
        if (digits.includes(phoneTerm)) return true;
      }
      return false;
    });
  }, [rows, q]);

  const toggleSort = (key) => {
    setPage(1);
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir("desc");
        return key;
      }
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return prev;
    });
  };

// GLOBAL sort (pe tot searchedRows), apoi filter, apoi pagination
 const sortedRows = useMemo(() => {
  const list = [...searchedRows];

  if (!showBalances) {
    list.sort((a, b) => (a._order ?? 0) - (b._order ?? 0));
    return list;
  }

  // Sort GLOBAL by selected balance column, tie-break by Balance DESC, Live balance DESC, then original order.
  const getCurrentSold = (row) => {
    const v = Number(calc[row.id]?.currentSold);
    return Number.isFinite(v) ? v : null;
  };

  const getCarry = (row) => {
    const v = Number(calc[row.id]?.carry);
    return Number.isFinite(v) ? v : null;
  };

  const getLiveDiff = (row) => {
    const v = Number(calc[row.id]?.diff);
    return Number.isFinite(v) ? v : null;
  };

  const getSortValue = (row) => {
    if (sortKey === "carry") return getCarry(row);
    if (sortKey === "live") return getLiveDiff(row);
    return getCurrentSold(row);
  };

  const compareNullable = (aVal, bVal) => {
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    if (aVal === bVal) return 0;
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  };

  list.sort((a, b) => {
    const primaryA = getSortValue(a);
    const primaryB = getSortValue(b);
    const primaryCmp = compareNullable(primaryA, primaryB);
    if (primaryCmp !== 0) return primaryCmp;

    const balA = getCurrentSold(a);
    const balB = getCurrentSold(b);
    const balanceCmp = compareNullable(balA, balB);
    if (balanceCmp !== 0) return balanceCmp;

    const diffA = getLiveDiff(a);
    const diffB = getLiveDiff(b);
    const diffCmp = compareNullable(diffA, diffB);
    if (diffCmp !== 0) return diffCmp;
    return (a._order ?? 0) - (b._order ?? 0);
  });

  return list;
}, [searchedRows, calc, showBalances, sortKey, sortDir]);


  const filteredRows = useMemo(() => {
    if (!showBalances || restFilter === "all") return sortedRows;
    const hasAllBalances = sortedRows.every((row) => calc[row.id]);
    if (!hasAllBalances) return sortedRows;
    return sortedRows.filter((row) => {
      const liveBalance = Number(calc[row.id]?.diff ?? 0);
      return getBalanceState(liveBalance) === restFilter;
    });
  }, [sortedRows, restFilter, calc, showBalances]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const displayRows = useMemo(() => {
    const start = (pageClamped - 1) * PER_PAGE;
    return filteredRows.slice(start, start + PER_PAGE);
  }, [filteredRows, pageClamped]);

const tableTotals = useMemo(() => {
  if (!showBalances) {
    return { totCurrent: 0, totCarry: 0 };
  }
  const totCurrent = displayRows.reduce((sum, p) => sum + Number(calc[p.id]?.currentSold ?? 0), 0);
  const totCarry = displayRows.reduce((sum, p) => sum + Number(calc[p.id]?.carry ?? 0), 0);
  return { totCurrent, totCarry };
}, [displayRows, calc, showBalances]);

  const columnCount =
    7 +
    (showEmail ? 1 : 0) +
    (showPhone ? 1 : 0) +
    (showPricing ? 1 : 0) +
    (showBalances ? 3 : 0);
  const summaryDetailSpan = 3 + (showEmail ? 1 : 0) + (showPhone ? 1 : 0) + (showPricing ? 1 : 0);

  // compute balances per row (STRICT din RPC; fără calcule în React)
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!showBalances || rows.length === 0) return;

      const [y, m] = selectedMonth.split("-").map(Number);
      const start = isoLocal(new Date(y, m - 1, 1));        // inclusiv
       const end   = isoLocal(new Date(y, m, 0));            // inclusiv (ultima zi a lunii)

        const entries = await mapWithConcurrency(rows, 8, async (p) => {
          if (!p.company_id) return [p.id, { currentSold: 0, carry: 0, diff: 0 }];

          const [marketSums, liveBalanceRes] = await Promise.all([
            fetchServiceLineSums(p.company_id, start, end, currentMarket),
            supabaseHelpers.getCompanyLiveBalance(
              p.company_id,
              currentMarket,
              start,
              end
            ),
          ]);
          const liveBalance = Number.isFinite(liveBalanceRes?.data)
            ? liveBalanceRes.data
            : 0;

          let current = Number(marketSums.current ?? 0);
          let carry = Number(marketSums.carry ?? 0) * -1;

          const otherSums = await fetchOtherLineSums(p.company_id, start, end, currentMarket);
          current += otherSums.monthTotal;
          carry += otherSums.carryTotal;

          return [p.id, { currentSold: current, carry, diff: liveBalance }];
        });

      if (mounted) {
        setCalc((prev) => {
          const next = { ...prev };
          entries.forEach(([id, values]) => {
            if (id) next[id] = values;
          });
          return next;
        });
      }
    })();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [rows, selectedMonth, showBalances, currentMarket]);

  const startEditStore = (profile) => {
    setEditingStoreId(profile.id);
    setStoreDraft(profile.store_name || "");
  };

const cancelEditStore = () => {
  setEditingStoreId(null);
  setStoreDraft("");
};

const saveStoreName = async () => {
  if (!editingStoreId) return;
  try {
    const payload = { store_name: storeDraft.trim() || null };
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", editingStoreId);
    if (error) throw error;
    setRows((prev) =>
      prev.map((r) => (r.id === editingStoreId ? { ...r, store_name: payload.store_name } : r))
    );
    setStoreBanner("Store name saved.");
    cancelEditStore();
    await reloadProfiles();
  } catch (err) {
    console.error("Failed to save store name:", err);
    setStoreBanner(err?.message || "Failed to save store name.");
  }
};

const togglePriceAccess = async (profile, nextValue) => {
  if (!profile?.id) return;
  setPriceToggleSaving((prev) => ({ ...prev, [profile.id]: true }));
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ can_view_prices: nextValue })
      .eq("id", profile.id);
    if (error) throw error;
    setRows((prev) =>
      prev.map((r) => (r.id === profile.id ? { ...r, can_view_prices: nextValue } : r))
    );
    setStoreBanner(
      nextValue
        ? t("clients.messages.priceAccessEnabled")
        : t("clients.messages.priceAccessDisabled")
    );
  } catch (err) {
    console.error("Failed to toggle price access:", err);
    setStoreBanner(err?.message || t("clients.messages.priceAccessError"));
  } finally {
    setPriceToggleSaving((prev) => ({ ...prev, [profile.id]: false }));
  }
};

  // --- RENDER
  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="bg-white border rounded-xl shadow-sm p-2 max-w-4xl">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,260px)_minmax(0,180px)_minmax(0,260px)_auto] text-xs items-center">
          {/* Month selector */}
          <div className="flex items-center gap-1.5">
            <button className="border rounded px-2 py-1" onClick={() => gotoMonth(-1)} title={t("clients.filters.prevMonth")}><ChevronLeft className="w-3 h-3" /></button>
            <div className="relative flex-1 min-w-[150px]">
              <CalendarIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-light" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  const mk = e.target.value; setSelectedMonth(mk);
                  const [yy, mm] = mk.split("-").map(Number);
                  const d = new Date(yy, mm - 1, 1);
                  setFrom(isoLocal(firstDayOfMonth(d)));
                  setTo(isoLocal(lastDayOfMonth(d)));
                  setPage(1);
                }}
                className="pl-7 pr-2 py-1.5 border rounded w-full text-xs"
              />
            </div>
            <button className="border rounded px-2 py-1" onClick={() => gotoMonth(1)} title={t("clients.filters.nextMonth")}><ChevronRight className="w-3 h-3" /></button>
          </div>

          {/* Balance filter */}
          {showBalances && (
            <div className="relative">
              <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-light" />
              <select value={restFilter} onChange={(e)=>setRestFilter(e.target.value)} className="pl-7 pr-2 py-1.5 border rounded w-full text-xs">
                <option value="all">{t("clients.balanceFilters.all")}</option>
                <option value="advance">{t("clients.balanceFilters.advance")}</option>
                <option value="overdue">{t("clients.balanceFilters.overdue")}</option>
              </select>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-light" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={t("clients.filters.searchPlaceholder")}
              className="pl-7 pr-8 py-1.5 w-full border rounded text-xs placeholder:text-[11px]"
            />
            {q.trim().length > 0 && (
              <button
                type="button"
                onClick={() => { setQ(''); setPage(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm font-semibold"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowEmail(!showEmail)}
            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 border rounded shadow-sm text-xs"
            title={t("clients.buttons.toggleEmail")}
          >
            {showEmail ? t("clients.buttons.hideEmail") : t("clients.buttons.showEmail")}
          </button>
          <button
            onClick={() => setShowPhone(!showPhone)}
            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 border rounded shadow-sm text-xs"
            title={t("clients.buttons.togglePhone")}
          >
            {showPhone ? t("clients.buttons.hidePhone") : t("clients.buttons.showPhone")}
          </button>
          <button
            onClick={() => setShowPricing(!showPricing)}
            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 border rounded shadow-sm text-xs"
            title={t("clients.buttons.togglePricing")}
          >
            {showPricing ? t("clients.buttons.hidePricing") : t("clients.buttons.showPricing")}
          </button>
        </div>
      </div>

      </div>

      {storeBanner && (
        <div className="px-4 py-2 rounded bg-blue-50 border border-blue-200 text-blue-700 text-sm">
          {storeBanner}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
        <span>{tp("clients.totalLabel", { count: rows.length })}</span>
      </div>

      {/* TABLE */}
      <div className="border rounded-lg bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left w-12">{t("clients.table.index")}</th>
              <th className="px-4 py-3 text-left">{t("clients.table.store")}</th>
              <th className="px-4 py-3 text-left">{t("clients.table.name")}</th>
              <th className="px-4 py-3 text-left">{t("clients.table.company")}</th>
              {showEmail && <th className="px-4 py-3 text-left">{t("clients.table.email")}</th>}
              {showPhone && <th className="px-4 py-3 text-left">{t("clients.table.phone")}</th>}
              <th className="px-4 py-3 text-left">{t("clients.table.createdAt")}</th>
              {showPricing && (
                <th className="px-4 py-3 text-left">{t("clients.table.pricingVisibility")}</th>
              )}
              {showBalances && (
                <>
                  <th className="px-4 py-3 text-left whitespace-pre-line">
                    <button
                      type="button"
                      onClick={() => toggleSort("current")}
                      className="inline-flex items-center gap-1 hover:text-text-primary"
                    >
                      {t("clients.table.currentBalance")}
                      {sortKey === "current" && (
                        <span className="text-[10px] uppercase text-text-light">{sortDir}</span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort("carry")}
                      className="inline-flex items-center gap-1 hover:text-text-primary"
                    >
                      {t("clients.table.carryBalance")}
                      {sortKey === "carry" && (
                        <span className="text-[10px] uppercase text-text-light">{sortDir}</span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort("live")}
                      className="inline-flex items-center gap-1 hover:text-text-primary"
                    >
                      {t("clients.table.liveBalance")}
                      {sortKey === "live" && (
                        <span className="text-[10px] uppercase text-text-light">{sortDir}</span>
                      )}
                    </button>
                  </th>
                </>
              )}
              <th className="px-4 py-3 text-right">{t("clients.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnCount} className="px-4 py-6 text-center text-gray-400">{t("common.loading")}</td></tr>
            ) : error ? (
              <tr><td colSpan={columnCount} className="px-4 py-6 text-center text-red-600">{error}</td></tr>
            ) : searchedRows.length === 0 ? (
              <tr><td colSpan={columnCount} className="px-4 py-6 text-center text-gray-400">{t("clients.empty")}</td></tr>
            ) : displayRows.length === 0 ? (
              <tr><td colSpan={columnCount} className="px-4 py-6 text-center text-gray-400">{t("clients.empty")}</td></tr>
            ) : (
              displayRows.map((p, idx) => {
                const rowNumber = (pageClamped - 1) * PER_PAGE + idx + 1;
                const name = [p.display_first_name || p.first_name, p.display_last_name || p.last_name]
                  .filter(Boolean)
                  .join(" ") || "—";
                const c = calc[p.id] || { currentSold: 0, carry: 0, diff: 0 };
                return (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">{rowNumber}</td>
                    <td className="px-4 py-3">
                      {editingStoreId === p.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={storeDraft}
                            onChange={(e) => setStoreDraft(e.target.value)}
                            className="border border-gray-300 rounded-md px-2 py-1 w-40 text-sm"
                            placeholder="Store..."
                          />
                          <button className="px-2 py-1 bg-primary text-white rounded text-xs" onClick={saveStoreName}>
                            Save
                          </button>
                          <button className="px-2 py-1 border rounded text-xs" onClick={cancelEditStore}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{p.store_name || "—"}</span>
                          <button className="text-xs text-primary hover:underline" onClick={() => startEditStore(p)}>
                            {p.store_name ? "Edit" : "Add"}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{name}</td>
                    <td className="px-4 py-3" title={p.company_id || ""}>{p.display_company_name || p.company_name || "—"}</td>
                    {showEmail && <td className="px-4 py-3">{p.email || "—"}</td>}
                    {showPhone && <td className="px-4 py-3">{p.phone || "—"}</td>}
                    <td className="px-4 py-3">{p.created_at?.slice(0,10) || "—"}</td>
                    {showPricing && (
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300"
                            checked={!!p.can_view_prices}
                            onChange={(e) => togglePriceAccess(p, e.target.checked)}
                            disabled={!!priceToggleSaving[p.id]}
                          />
                          <span>
                            {p.can_view_prices
                              ? t("clients.table.pricingVisible")
                              : t("clients.table.pricingHidden")}
                          </span>
                          {priceToggleSaving[p.id] && (
                            <span className="text-[11px] text-text-light">{t("common.loading")}</span>
                          )}
                        </label>
                      </td>
                    )}
                    {showBalances && (
                      <>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-900">
                            {fmt2(Number(c.currentSold || 0))}
                          </span>
                        </td>
                        <td className="px-4 py-3"><MoneyPill value={c.carry} /></td>
                        <td className="px-4 py-3"><MoneyPill value={c.diff} /></td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right">
                      <button className="text-sm bg-primary text-white rounded px-3 py-1" onClick={() => onSelect?.(p)}>{t("clients.table.open")}</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {showBalances && !loading && displayRows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-slate-50/80 font-semibold text-text-primary">
                <td className="px-4 py-3">{t("clients.csv.footer")}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" colSpan={summaryDetailSpan} />
                <td className="px-4 py-3">{fmt2(tableTotals.totCurrent)}</td>
                <td className="px-4 py-3">{fmt2(tableTotals.totCarry)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}

        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 justify-end text-sm">
        <button className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageClamped <= 1} title={t("clients.paginationPrev")}><ChevronLeft className="w-4 h-4" /></button>
        <span>{tp("clients.pagination", { page: pageClamped, total: totalPages })}</span>
        <button className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageClamped >= totalPages} title={t("clients.paginationNext")}><ChevronRight className="w-4 h-4" /></button>
      </div>

    </div>
  );
}
