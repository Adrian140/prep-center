import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Users,
  Eye,
  RefreshCw,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Calendar,
  TrendingUp,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { supabase } from "@/lib/supabase";

const DATE_PRESETS = [
  { label: "7 Days", value: "7d", days: 7 },
  { label: "30 Days", value: "30d", days: 30 },
  { label: "3 Months", value: "3m", months: 3 },
  { label: "6 Months", value: "6m", months: 6 },
  { label: "1 Year", value: "1y", months: 12 },
];

const COLORS = ["#3b95f4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const COLOR_CLASSES = {
  primary: {
    box: "bg-primary-500/20",
    icon: "text-primary-400",
  },
  green: {
    box: "bg-green-500/20",
    icon: "text-green-400",
  },
  yellow: {
    box: "bg-yellow-500/20",
    icon: "text-yellow-400",
  },
  purple: {
    box: "bg-purple-500/20",
    icon: "text-purple-400",
  },
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const subDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
};

const subMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
};

const formatDayKey = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatChartDate = (date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(date));

const StatCard = ({ icon: Icon, label, value, subValue, trend, color = "primary" }) => {
  const classes = COLOR_CLASSES[color] || COLOR_CLASSES.primary;

  return (
    <div className="bg-dark-800/50 border border-white/10 rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-extralight text-white/60 mb-1">{label}</p>
          <p className="text-3xl font-medium text-white">{value}</p>
          {subValue && (
            <p className="text-lg font-extralight text-white/40 mt-1">{subValue}</p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${classes.box}`}>
          <Icon className={`w-6 h-6 ${classes.icon}`} />
        </div>
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-3 text-lg ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
          {trend >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          <span>{Math.abs(trend).toFixed(1)}% vs previous period</span>
        </div>
      )}
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark-800 border border-white/20 rounded-lg p-4 shadow-xl">
        <p className="text-lg font-medium text-white mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-lg font-extralight" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState("3m");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [stats, setStats] = useState(null);
  const [rawVisits, setRawVisits] = useState([]);
  const [error, setError] = useState(null);

  const getDateRange = useCallback(() => {
    if (customStartDate && customEndDate) {
      return {
        start: startOfDay(new Date(customStartDate)),
        end: endOfDay(new Date(customEndDate)),
      };
    }

    const preset = DATE_PRESETS.find((p) => p.value === selectedPreset);
    const end = endOfDay(new Date());
    let start;

    if (preset?.months) {
      start = startOfDay(subMonths(new Date(), preset.months));
    } else {
      start = startOfDay(subDays(new Date(), preset?.days || 30));
    }

    return { start, end };
  }, [selectedPreset, customStartDate, customEndDate]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { start, end } = getDateRange();

      const { data: visits, error: visitsError } = await supabase
        .from("page_visits")
        .select("*")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true });

      if (visitsError) throw visitsError;

      setRawVisits(visits || []);

      const totalVisits = visits?.length || 0;
      const uniqueVisitors = new Set(visits?.map((v) => v.visitor_id) || []).size;

      const visitorCounts = {};
      visits?.forEach((v) => {
        visitorCounts[v.visitor_id] = (visitorCounts[v.visitor_id] || 0) + 1;
      });

      let returning2 = 0;
      let returning3 = 0;
      let returning4plus = 0;

      Object.values(visitorCounts).forEach((count) => {
        if (count === 2) returning2++;
        else if (count === 3) returning3++;
        else if (count >= 4) returning4plus++;
      });

      const visitsByDay = {};
      visits?.forEach((v) => {
        const day = formatDayKey(v.created_at);
        if (!visitsByDay[day]) {
          visitsByDay[day] = { date: day, visits: 0, visitors: new Set() };
        }
        visitsByDay[day].visits++;
        visitsByDay[day].visitors.add(v.visitor_id);
      });

      const chartData = Object.values(visitsByDay)
        .map((d) => ({
          date: formatChartDate(d.date),
          fullDate: d.date,
          visits: d.visits,
          visitors: d.visitors.size,
        }))
        .sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));

      const deviceBreakdown = {};
      visits?.forEach((v) => {
        const device = v.device_type || "Unknown";
        deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;
      });

      const browserBreakdown = {};
      visits?.forEach((v) => {
        const browser = v.browser || "Unknown";
        browserBreakdown[browser] = (browserBreakdown[browser] || 0) + 1;
      });

      const pageBreakdown = {};
      visits?.forEach((v) => {
        const page = v.page_path || "/";
        pageBreakdown[page] = (pageBreakdown[page] || 0) + 1;
      });

      const referrerBreakdown = {};
      visits?.forEach((v) => {
        if (v.referrer) {
          try {
            const url = new URL(v.referrer);
            const domain = url.hostname;
            referrerBreakdown[domain] = (referrerBreakdown[domain] || 0) + 1;
          } catch {
            referrerBreakdown["Direct"] = (referrerBreakdown["Direct"] || 0) + 1;
          }
        } else {
          referrerBreakdown["Direct"] = (referrerBreakdown["Direct"] || 0) + 1;
        }
      });

      setStats({
        totalVisits,
        uniqueVisitors,
        returning2,
        returning3,
        returning4plus,
        chartData,
        deviceBreakdown: Object.entries(deviceBreakdown).map(([name, value]) => ({
          name,
          value,
        })),
        browserBreakdown: Object.entries(browserBreakdown)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5),
        pageBreakdown: Object.entries(pageBreakdown)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        referrerBreakdown: Object.entries(referrerBreakdown)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5),
      });
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setError("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    setCustomStartDate("");
    setCustomEndDate("");
  };

  const handleCustomDateChange = () => {
    if (customStartDate && customEndDate) {
      fetchAnalytics();
    }
  };

  const getDeviceIcon = (device) => {
    switch (String(device || "").toLowerCase()) {
      case "mobile":
        return Smartphone;
      case "tablet":
        return Tablet;
      default:
        return Monitor;
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-lg text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-lg font-light"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div id="admin_analytics" className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-white mb-2">
            Site Analytics
          </h2>
          <p className="text-lg font-extralight text-white/60">
            Track visitors, page views, and traffic sources
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePresetChange(preset.value)}
              className={`px-4 py-2 rounded-lg text-lg font-extralight transition-all ${
                selectedPreset === preset.value && !customStartDate
                  ? "bg-primary-500 text-white"
                  : "bg-dark-800/50 text-white/60 hover:bg-dark-800 hover:text-white"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="p-2 bg-dark-800/50 text-white/60 rounded-lg hover:bg-dark-800 hover:text-white transition-all"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="bg-dark-800/50 border border-white/10 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-white/40" />
            <span className="text-lg font-extralight text-white/60">Custom Range:</span>
          </div>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            className="px-4 py-2 bg-dark-700 border border-white/10 rounded-lg text-white text-lg font-extralight focus:outline-none focus:border-primary-500"
          />
          <span className="text-white/40">to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            className="px-4 py-2 bg-dark-700 border border-white/10 rounded-lg text-white text-lg font-extralight focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={handleCustomDateChange}
            disabled={!customStartDate || !customEndDate}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-lg font-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Eye}
          label="Total Page Views"
          value={stats?.totalVisits?.toLocaleString() || 0}
          color="primary"
        />
        <StatCard
          icon={Users}
          label="Unique Visitors"
          value={stats?.uniqueVisitors?.toLocaleString() || 0}
          color="green"
        />
        <StatCard
          icon={TrendingUp}
          label="Returning (2nd visit)"
          value={stats?.returning2 || 0}
          subValue={`${((stats?.returning2 / stats?.uniqueVisitors) * 100 || 0).toFixed(1)}% of visitors`}
          color="yellow"
        />
        <StatCard
          icon={BarChart3}
          label="Returning (3+ visits)"
          value={(stats?.returning3 || 0) + (stats?.returning4plus || 0)}
          subValue={`3rd: ${stats?.returning3 || 0} | 4th+: ${stats?.returning4plus || 0}`}
          color="purple"
        />
      </div>

      <div className="bg-dark-800/50 border border-white/10 rounded-lg p-6">
        <h3 className="text-xl font-medium text-white mb-6">Traffic Over Time</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats?.chartData || []}>
              <defs>
                <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b95f4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b95f4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.4)"
                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="visits"
                name="Page Views"
                stroke="#3b95f4"
                fillOpacity={1}
                fill="url(#colorVisits)"
              />
              <Area
                type="monotone"
                dataKey="visitors"
                name="Unique Visitors"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorVisitors)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-800/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary-400" />
            Device Breakdown
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.deviceBreakdown || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(stats?.deviceBreakdown || []).map((entry, index) => {
                    const DeviceIcon = getDeviceIcon(entry.name);
                    return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                  })}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-400" />
            Top Browsers
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.browserBreakdown || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis
                  type="number"
                  stroke="rgba(255,255,255,0.4)"
                  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="rgba(255,255,255,0.4)"
                  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Visits" fill="#3b95f4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-800/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-xl font-medium text-white mb-4">Top Pages</h3>
          <div className="space-y-3">
            {(stats?.pageBreakdown || []).map((page, index) => (
              <div
                key={page.name}
                className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-primary-500/20 rounded-full flex items-center justify-center text-lg text-primary-400">
                    {index + 1}
                  </span>
                  <span className="text-lg font-extralight text-white truncate max-w-[200px]">
                    {page.name}
                  </span>
                </div>
                <span className="text-lg font-medium text-white">{page.value}</span>
              </div>
            ))}
            {(!stats?.pageBreakdown || stats.pageBreakdown.length === 0) && (
              <p className="text-lg font-extralight text-white/40 text-center py-4">
                No page data available
              </p>
            )}
          </div>
        </div>

        <div className="bg-dark-800/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-xl font-medium text-white mb-4">Traffic Sources</h3>
          <div className="space-y-3">
            {(stats?.referrerBreakdown || []).map((source, index) => (
              <div
                key={source.name}
                className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-primary-400" />
                  <span className="text-lg font-extralight text-white truncate max-w-[200px]">
                    {source.name}
                  </span>
                </div>
                <span className="text-lg font-medium text-white">{source.value}</span>
              </div>
            ))}
            {(!stats?.referrerBreakdown || stats.referrerBreakdown.length === 0) && (
              <p className="text-lg font-extralight text-white/40 text-center py-4">
                No referrer data available
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
