// FILE: src/components/dashboard/client/ClientBalanceBar.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../../config/supabase";
import { useDashboardTranslation } from "../../../translations";

const DEBUG_BALANCE = false;
const normStatus = (s) => String(s || "").trim().toLowerCase();

const fmt2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

const num = (v, { allowNull = false } = {}) => {
  if (v === "" || v == null) return allowNull ? null : 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : (allowNull ? null : 0);
};

export default function ClientBalanceBar({ companyId }) {
  const { t } = useDashboardTranslation();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) {
          setBalance(0);
          setLoading(false);
        }
        return;
      }
      setLoading(true);

      const [{ data: fbaAll }, { data: fbmAll }] = await Promise.all([
        supabase
          .from("fba_lines")
          .select("id, unit_price, units, total, service_date")
          .eq("company_id", companyId),
        supabase
          .from("fbm_lines")
          .select("id, unit_price, orders_units, total, service_date")
          .eq("company_id", companyId),
      ]);

      const fbaSum = (fbaAll || []).reduce((s, r) => {
        const v = r.total != null ? num(r.total) : num(r.unit_price) * num(r.units);
        return s + (Number.isFinite(v) ? v : 0);
      }, 0);

      const fbmSum = (fbmAll || []).reduce((s, r) => {
        const v =
          r.total != null ? num(r.total) : num(r.unit_price) * num(r.orders_units);
        return s + (Number.isFinite(v) ? v : 0);
      }, 0);

      const { data: invoicesAll } = await supabase
        .from("invoices")
        .select("id, amount, status, issue_date, company_id")
        .eq("company_id", companyId);

      const paidSum = (invoicesAll || []).reduce((s, r) => {
        const isPaid = normStatus(r.status) === "paid";
        const val = num(r.amount);
        return s + (isPaid && Number.isFinite(val) ? val : 0);
      }, 0);

      const diff = fbaSum + fbmSum - paidSum;

      if (DEBUG_BALANCE) {
        console.log("[BALANCE DEBUG] all-time:", {
          fbaSum: fbaSum.toFixed(2),
          fbmSum: fbmSum.toFixed(2),
          services: (fbaSum + fbmSum).toFixed(2),
          paidSum: paidSum.toFixed(2),
          balance: diff.toFixed(2),
        });
      }

      if (mounted) {
        setBalance(diff);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [companyId]);

  const isZero = !Number.isFinite(balance) || Math.abs(balance) < 1e-9;
  const cls = isZero
    ? "bg-gray-100 text-gray-700"
    : balance < 0
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";

  return (
    <div className="mb-6">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-end">
        <div className="text-sm text-text-secondary self-start">{t('balance.title')}</div>
        <div className={`px-3 py-1 rounded-md text-base font-semibold ${cls}`}>
          {loading
            ? t('common.calculating')
            : t('balance.current').replace('{amount}', fmt2(Number(balance || 0)))}
        </div>
        {balance < 0 && !loading && (
          <div className="mt-2 text-xs text-green-600 italic">
            {t('balance.prepayment').replace('{amount}', fmt2(Math.abs(balance)))}
          </div>
        )}
        {balance > 0 && !loading && (
          <div className="mt-2 text-xs text-red-600 italic">
            {t('balance.outstanding').replace('{amount}', fmt2(balance))}
          </div>
        )}
      </div>
    </div>
  );
}
