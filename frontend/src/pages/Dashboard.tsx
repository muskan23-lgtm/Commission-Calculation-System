import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import {
  Banknote,
  BarChart3,
  Users,
  Shield,
  ChevronUp,
  ChevronDown,
  LineChart,
  Crown,
  Briefcase,
  User,
} from "lucide-react";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  ChartData,
  ChartOptions,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

type DashboardSummary = {
  totals: {
    commissions: number;
    sales: number;
    agents: number;
  };
  deltas: {
    commissions: number;
    sales: number;
    customers: number;
    avg_deal_size: number;
  };
  stats: {
    new_customers: number;
    avg_deal_size: number;
  };
  revenue_over_time: { label: string; amount: number }[];
  team_breakdown: { label: string; amount: number }[];
  recent_sales: { id: number; sales_rep: string | number; customer: string; amount: number; date: string }[];
  hierarchy: { level: number; title: string; count: number; members: string[] }[];
  top_earners: { agent: string; amount: number }[];
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const levelMeta = {
  4: { icon: Crown, tone: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" },
  3: { icon: Briefcase, tone: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
  2: { icon: Users, tone: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
  1: { icon: User, tone: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
} as const;

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<DashboardSummary>("/dashboard/summary");
        setSummary(data);
      } catch (err: any) {
        setError(err?.response?.data?.error || "Unable to load dashboard insights.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statCards = useMemo(() => {
    if (!summary) return [];

    return [
      {
        title: "Total Commissions Paid",
        value: currency.format(summary.totals.commissions),
        delta: summary.deltas.commissions,
        icon: Banknote,
        accent: "bg-indigo-50 text-indigo-600",
      },
      {
        title: "Total Sales Revenue",
        value: currency.format(summary.totals.sales),
        delta: summary.deltas.sales,
        icon: BarChart3,
        accent: "bg-sky-50 text-sky-600",
      },
      {
        title: "New Customers",
        value: summary.stats.new_customers.toLocaleString(),
        delta: summary.deltas.customers,
        icon: Users,
        accent: "bg-emerald-50 text-emerald-600",
      },
      {
        title: "Average Deal Size",
        value: currency.format(summary.stats.avg_deal_size),
        delta: summary.deltas.avg_deal_size,
        icon: Shield,
        accent: "bg-violet-50 text-violet-600",
      },
    ];
  }, [summary]);

  const revenueChart = useMemo<ChartData<"line">>(() => {
    const labels = summary?.revenue_over_time.map((r) => r.label) ?? [];
    const values = summary?.revenue_over_time.map((r) => r.amount) ?? [];

    return {
      labels,
      datasets: [
        {
          label: "Sales Revenue",
          data: values,
          tension: 0.45,
          borderWidth: 3,
          pointRadius: 0,
          fill: true,
          borderColor: "rgba(59, 130, 246, 1)",
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: canvasCtx, chartArea } = chart;
            if (!chartArea) return "rgba(59, 130, 246, 0.1)";
            const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, "rgba(59, 130, 246, 0.25)");
            gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
            return gradient;
          },
        },
      ],
    };
  }, [summary]);

  const revenueOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
      scales: {
        x: {
          ticks: { color: "#6b7280" },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: "#6b7280",
            callback: (value) => currency.format(Number(value)),
          },
          grid: { color: "rgba(148, 163, 184, 0.15)" },
        },
      },
    }),
    []
  );

  const teamBreakdownData = useMemo((): ChartData<"doughnut"> => {
    const breakdown = summary?.team_breakdown ?? [];
    const palette = ["#6366F1", "#22C55E", "#F59E0B", "#0EA5E9", "#F97316"];
    return {
      labels: breakdown.map((b) => b.label),
      datasets: [
        {
          data: breakdown.map((b) => b.amount),
          backgroundColor: breakdown.map((_, idx) => palette[idx % palette.length]),
          borderWidth: 0,
        },
      ],
    };
  }, [summary]);

  const teamBreakdownOptions: ChartOptions<"doughnut"> = useMemo(
    () => ({
      cutout: "70%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${currency.format(Number(ctx.parsed))}`,
          },
        },
      },
    }),
    []
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !summary) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    );
  }

  const totalBreakdown = summary.team_breakdown.reduce((acc, item) => acc + item.amount, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Sales &amp; Commission Dashboard</h1>
          <p className="text-slate-500">Overview of payouts, sales performance, and hierarchy health.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:border-slate-300">Today</button>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:border-slate-300">Last 7 Days</button>
          <button className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white shadow-sm">This Month</button>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:border-slate-300">Custom</button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ title, value, delta, icon: Icon, accent }) => (
          <article key={title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
              </div>
              <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accent}`}>
                <Icon size={20} />
              </span>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-slate-500">
              {delta >= 0 ? (
                <>
                  <ChevronUp className="h-4 w-4 text-emerald-500" />
                  <span className="text-emerald-600">+{delta.toFixed(1)}%</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 text-rose-500" />
                  <span className="text-rose-600">{delta.toFixed(1)}%</span>
                </>
              )}
              <span>vs last month</span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Sales Revenue Over Time</p>
              <h3 className="text-lg font-semibold text-slate-900">
                {currency.format(
                  summary.revenue_over_time.length
                    ? summary.revenue_over_time[summary.revenue_over_time.length - 1].amount
                    : 0
                )}
              </h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              <LineChart size={14} />
              Last 4 weeks
            </div>
          </header>
          <div className="mt-6 h-64">
            <Line data={revenueChart} options={revenueOptions} />
          </div>
        </article>

        <article className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <header>
            <p className="text-xs uppercase tracking-wide text-slate-400">Commissions by Team</p>
            <h3 className="text-lg font-semibold text-slate-900">Distribution</h3>
          </header>
          <div className="relative mt-6 flex items-center justify-center">
            <div className="h-48 w-48">
              <Doughnut data={teamBreakdownData} options={teamBreakdownOptions} />
            </div>
            <div className="absolute flex flex-col items-center">
              <span className="text-xs uppercase tracking-wide text-slate-400">Total Paid</span>
              <span className="text-xl font-semibold text-slate-900">
                {compactCurrency.format(totalBreakdown)}
              </span>
            </div>
          </div>
          <ul className="mt-6 space-y-3 text-sm">
            {summary.team_breakdown.map((row, idx) => {
              const colors = teamBreakdownData.datasets?.[0]?.backgroundColor as (string | undefined)[] | undefined;
              const color = colors?.[idx] ?? "#6366F1";
              return (
                <li key={row.label} className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {row.label}
                  </span>
                  <span className="font-semibold text-slate-900">{currency.format(row.amount)}</span>
                </li>
              );
            })}
          </ul>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Recent Sales</p>
              <h3 className="text-lg font-semibold text-slate-900">Latest activity</h3>
            </div>
          </header>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Sales Rep</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {summary.recent_sales.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                      No sales recorded yet.
                    </td>
                  </tr>
                )}
                {summary.recent_sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{sale.sales_rep}</td>
                    <td className="px-4 py-3 text-slate-600">{sale.customer}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{currency.format(sale.amount)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(sale.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <header>
            <p className="text-xs uppercase tracking-wide text-slate-400">Team Hierarchy</p>
            <h3 className="text-lg font-semibold text-slate-900">Structure &amp; headcount</h3>
          </header>

          <ul className="mt-4 space-y-3 text-sm">
            {summary.hierarchy.map((layer) => {
              const meta = levelMeta[layer.level as keyof typeof levelMeta] ?? levelMeta[1];
              const Icon = meta.icon;
              return (
                <li
                  key={layer.level}
                  className={`flex flex-col rounded-2xl border ${meta.border} ${meta.bg} p-4`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-2 font-semibold ${meta.tone}`}>
                      <Icon size={18} />
                      {layer.title.toUpperCase()} (Level {layer.level})
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {layer.count} member{layer.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {layer.members.length ? layer.members.join(", ") : "No members yet."}
                  </p>
                </li>
              );
            })}
          </ul>
        </article>
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-16 animate-pulse rounded-3xl bg-slate-200/70" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-32 animate-pulse rounded-3xl bg-slate-200/70" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />
        <div className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />
        <div className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />
      </div>
    </div>
  );
}
