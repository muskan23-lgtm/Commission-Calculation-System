import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Download, Gauge, Sparkles, TrendingUp, Trophy, Users } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend);

type AgentOpt = { id: number; name: string };

type SummaryResp = {
  period: { mode: string; label: string; start: string; end: string };
  by_agent_bar: { agent: string; commission: number }[];
  trend: { label: string; value: number }[];
  kpi_total: number;
  history: { quarter: string; agent: string; total_sale: number; avg_rate: number; total_commission: number }[];
  volume_bonus: { agent: string; volume: number; tier: string; bonus: number }[];
  agents: AgentOpt[];
};

const tabs: Array<"monthly" | "quarterly" | "annual"> = ["monthly", "quarterly", "annual"];
const modeLabels: Record<(typeof tabs)[number], string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export default function Reports() {
  const [mode, setMode] = useState<"monthly" | "quarterly" | "annual">("quarterly");
  const [agent, setAgent] = useState<"all" | number>("all");
  const [data, setData] = useState<SummaryResp | null>(null);
  const [loading, setLoading] = useState(true);

  const parseAgentValue = (value: string): "all" | number => {
    if (value === "all") return "all";
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? "all" : parsed;
  };

  const fetchData = async (m: "monthly" | "quarterly" | "annual" = mode, a: "all" | number = agent) => {
    setLoading(true);
    try {
      const res = await api.get<SummaryResp>("/reports/summary", {
        params: { mode: m, agent_id: a === "all" ? "all" : a },
      });
      setData(res.data);
    } catch (error) {
      console.error("Failed to load commission summary", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCSV = async () => {
    if (!data) return;
    try {
      const res = await api.get("/reports/export", {
        params: { mode, agent_id: agent === "all" ? "all" : agent },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `commission_report_${data?.period.label || mode}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export commission report", error);
    }
  };

  const barData = useMemo(() => {
    const labels = data?.by_agent_bar.map((d) => d.agent) || [];
    const vals = data?.by_agent_bar.map((d) => d.commission) || [];
    return {
      labels,
      datasets: [
        {
          label: "Total Commission",
          data: vals,
          backgroundColor: "rgba(79, 70, 229, 0.85)",
          hoverBackgroundColor: "rgba(79, 70, 229, 1)",
          borderRadius: 12,
          barThickness: "flex" as const,
        },
      ],
    };
  }, [data]);

  const lineData = useMemo(() => {
    const labels = data?.trend.map((d) => d.label) || [];
    const vals = data?.trend.map((d) => d.value) || [];
    return {
      labels,
      datasets: [
        {
          label: "Commission Trend",
          data: vals,
          borderWidth: 2,
          tension: 0.45,
          borderColor: "rgba(236, 72, 153, 1)",
          backgroundColor: "rgba(236, 72, 153, 0.15)",
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    };
  }, [data]);

  const insights = useMemo(() => {
    if (!data) return null;

    const totalVolume = data.history.reduce((sum, entry) => sum + entry.total_sale, 0);
    const avgRate =
      data.history.length > 0
        ? data.history.reduce((sum, entry) => sum + entry.avg_rate, 0) / data.history.length
        : 0;
    const sortedAgents = [...data.by_agent_bar].sort((a, b) => b.commission - a.commission);
    const topAgent = sortedAgents[0] ?? null;
    const agentsCount = data.agents?.length ?? 0;

    const trendStart = data.trend[0]?.value ?? 0;
    const trendEnd = data.trend[data.trend.length - 1]?.value ?? 0;
    const growth = trendStart ? ((trendEnd - trendStart) / trendStart) * 100 : trendEnd ? 100 : 0;

    return { totalVolume, avgRate, topAgent, agentsCount, growth };
  }, [data]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
    []
  );

  const compactCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    []
  );

  const periodLabel = data?.period.label ?? `${modeLabels[mode]} Snapshot`;
  const selectedAgentDisplay = useMemo(() => {
    if (!data) {
      return agent === "all" ? "All agents" : `Agent #${agent}`;
    }
    if (agent === "all") {
      const total = data.agents.length;
      return total ? `${total} active ${total === 1 ? "agent" : "agents"}` : "All agents";
    }
    const match = data.agents.find((entry) => entry.id === agent);
    return match ? match.name : `Agent #${agent}`;
  }, [agent, data]);

  const exportDisabled = loading || !data;
  const showSkeleton = loading && !data;

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-rose-500 p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute inset-0 opacity-45 mix-blend-screen">
          <div className="absolute -left-16 top-8 h-44 w-44 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute bottom-10 right-10 h-56 w-56 rounded-full bg-indigo-400/40 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-100">
              <Sparkles className="h-4 w-4" />
              Revenue Intelligence
            </div>
            <div className="max-w-xl space-y-3">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Commission Reports</h1>
              <p className="text-sm leading-relaxed text-indigo-100/90 sm:text-base">
                Immerse your team in rich, interactive analytics. Explore agent performance, understand growth trends,
                and celebrate the top performers that power your revenue engine.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wide text-indigo-50">
              <span className="rounded-full bg-white/15 px-3 py-1">Period: {periodLabel}</span>
              <span className="rounded-full bg-white/15 px-3 py-1">View: {selectedAgentDisplay}</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-end lg:w-auto">
            <div className="flex rounded-full bg-white/20 p-1 shadow-inner">
              {tabs.map((t) => {
                const isActive = mode === t;
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setMode(t);
                      fetchData(t, agent);
                    }}
                    className={`relative rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive ? "bg-white text-indigo-600 shadow-lg" : "text-indigo-100 hover:bg-white/10"
                    }`}
                  >
                    {modeLabels[t]}
                    {isActive && <span className="absolute inset-x-4 bottom-1 block h-0.5 rounded-full bg-indigo-100/70" />}
                  </button>
                );
              })}
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
              <select
                className="w-full rounded-xl border border-white/40 bg-white/95 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition focus:border-white focus:outline-none focus:ring-2 focus:ring-white sm:w-52"
                value={String(agent)}
                disabled={loading && !data}
                onChange={(event) => {
                  const nextAgent = parseAgentValue(event.target.value);
                  setAgent(nextAgent);
                  fetchData(mode, nextAgent);
                }}
              >
                <option value="all">All Agents</option>
                {data?.agents?.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} (ID: {entry.id})
                  </option>
                ))}
              </select>
              <button
                onClick={exportCSV}
                disabled={exportDisabled}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-indigo-600 ${
                  exportDisabled
                    ? "cursor-not-allowed bg-white/40 text-indigo-100"
                    : "bg-white text-indigo-600 shadow-lg hover:bg-indigo-50"
                }`}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSkeleton ? (
        <div className="grid gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="h-48 rounded-3xl bg-gradient-to-r from-slate-200 to-slate-100/80 animate-pulse" />
            <div className="h-48 rounded-3xl bg-gradient-to-r from-slate-200 to-slate-100/80 animate-pulse" />
          </div>
          <div className="h-64 rounded-3xl bg-gradient-to-r from-slate-200 to-slate-100/80 animate-pulse" />
          <div className="h-64 rounded-3xl bg-gradient-to-r from-slate-200 to-slate-100/80 animate-pulse" />
        </div>
      ) : data ? (
        <div className={`space-y-8 ${loading ? "pointer-events-none opacity-95" : ""}`}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Total Commission</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{currencyFormatter.format(data.kpi_total)}</p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {insights ? `${insights.growth > 0 ? "+" : ""}${insights.growth.toFixed(1)}% vs first period` : "—"}
                  </div>
                </div>
                <div className="rounded-full bg-indigo-50 p-3 text-indigo-500">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales Volume</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {insights ? currencyFormatter.format(insights.totalVolume) : currencyFormatter.format(0)}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    {insights
                      ? `${compactCurrencyFormatter.format(insights.totalVolume / (insights.agentsCount || 1))} avg per agent`
                      : "Balanced performance"}
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 p-3 text-slate-500">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">Avg Commission Rate</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {insights ? `${(insights.avgRate * 100).toFixed(2)}%` : "0.00%"}
                  </p>
                  <p className="mt-3 text-xs text-amber-600/80">
                    {modeLabels[mode]} cadence across {insights?.agentsCount ?? 0} agents
                  </p>
                </div>
                <div className="rounded-full bg-amber-50 p-3 text-amber-500">
                  <Gauge className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Top Performer</p>
                    <p className="mt-2 text-lg font-semibold text-gray-900">
                      {insights?.topAgent ? insights.topAgent.agent : "Awaiting data"}
                    </p>
                    <p className="mt-1 text-xs text-emerald-600/80">Driving peak commission earnings</p>
                  </div>
                  <div className="rounded-full bg-emerald-50 p-3 text-emerald-500">
                    <Trophy className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-xs font-medium text-emerald-600">
                  {insights?.topAgent
                    ? `${currencyFormatter.format(insights.topAgent.commission)} earned this period`
                    : "Track momentum as results come in"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-indigo-100 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-600">Commission by Agent</p>
                  <p className="text-xs text-slate-500">Compare agent performance at a glance</p>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                  {modeLabels[mode]} view
                </span>
              </div>
              <div className="mt-4 h-64">
                <Bar
                  data={barData}
                  options={{
                    plugins: { legend: { display: false } },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: { color: "#475569" },
                      },
                      y: {
                        beginAtZero: true,
                        ticks: { color: "#475569" },
                        grid: { color: "rgba(209, 213, 219, 0.3)", drawTicks: false },
                      },
                    },
                    maintainAspectRatio: false,
                  }}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-rose-100 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-rose-500">Commission Trend</p>
                  <p className="text-xs text-slate-500">Track growth and seasonality over time</p>
                </div>
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-500">
                  {data.trend.length} points
                </span>
              </div>
              <div className="mt-4 h-64">
                <Line
                  data={lineData}
                  options={{
                    plugins: { legend: { display: false } },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: { color: "#475569" },
                      },
                      y: {
                        beginAtZero: true,
                        ticks: { color: "#475569" },
                        grid: { color: "rgba(252, 165, 165, 0.25)", drawTicks: false },
                      },
                    },
                    maintainAspectRatio: false,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Commission History</h3>
                  <p className="text-sm text-slate-500">Dive into historic payouts and sales performance.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {(insights?.agentsCount ?? 0) || data.history.length ? "Detailed ledger" : "No records"}
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 text-left font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Quarter</th>
                      <th className="px-4 py-3">Agent Name</th>
                      <th className="px-4 py-3">Total Sale Amount</th>
                      <th className="px-4 py-3">Avg Commission Rate</th>
                      <th className="px-4 py-3">Total Commission Earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((row, idx) => (
                      <tr
                        key={`${row.agent}-${row.quarter}-${idx}`}
                        className="border-t border-slate-100/80 bg-white/60 transition hover:bg-indigo-50/40"
                      >
                        <td className="px-4 py-3 font-medium text-slate-600">{row.quarter}</td>
                        <td className="px-4 py-3 text-slate-700">{row.agent}</td>
                        <td className="px-4 py-3 text-slate-700">
                          ₹{row.total_sale.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{(row.avg_rate * 100).toFixed(2)}%</td>
                        <td className="px-4 py-3 text-slate-700">
                          ₹{row.total_commission.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {!data.history.length && (
                      <tr className="border-t border-slate-100/80">
                        <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                          No historical records found for this view.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Volume Bonus Calculation</h3>
                  <p className="text-sm text-slate-500">
                    Recognise bonus tiers and celebrate agents doubling down on volume.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600">
                  {modeLabels[mode]} cadence
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-100">
                <table className="w-full text-sm">
                  <thead className="bg-emerald-50/80 text-left font-semibold text-emerald-600">
                    <tr>
                      <th className="px-4 py-3">Agent Name</th>
                      <th className="px-4 py-3">
                        Total Sales Volume (
                        {mode === "quarterly" ? "Quarterly" : mode === "monthly" ? "Monthly" : "Annual"})
                      </th>
                      <th className="px-4 py-3">Bonus Tier</th>
                      <th className="px-4 py-3">Bonus Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.volume_bonus.map((row, idx) => (
                      <tr
                        key={`${row.agent}-${row.tier}-${idx}`}
                        className="border-t border-emerald-100/70 bg-white/60 transition hover:bg-emerald-50/50"
                      >
                        <td className="px-4 py-3 font-medium text-emerald-700">{row.agent}</td>
                        <td className="px-4 py-3 text-emerald-700">
                          ₹{row.volume.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                            {row.tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-emerald-700">
                          ₹{row.bonus.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {!data.volume_bonus.length && (
                      <tr className="border-t border-emerald-100/70">
                        <td className="px-4 py-8 text-center text-emerald-500" colSpan={4}>
                          No bonus records for the selected view yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-red-100 bg-red-50/70 p-10 text-center text-sm text-red-600 shadow-sm">
          We could not retrieve the latest commission insights. Please try refreshing or adjusting your filters.
        </div>
      )}
    </div>
  );
}
