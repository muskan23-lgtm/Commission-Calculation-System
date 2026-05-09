import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { Auth } from "../store/auth";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type TooltipItem,
} from "chart.js";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  FileWarning,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type TrendPoint = { label: string; value: number };
type SalesBreakdown = { name: string; count: number; amount?: number };
type SummaryResponse = {
  pending?: number;
  impact?: number;
  avg?: number;
  trend?: TrendPoint[];
  by_sales?: SalesBreakdown[];
  top_reasons?: { label: string; count: number }[];
  approvals?: { pending?: number; approved?: number; denied?: number };
};

type Row = {
  id: number;
  policy_number: string;
  cancellation_date: string;
  status: "PENDING" | "PROCESSING" | "APPROVED" | "DENIED";
  amount: number;
  original_amount: number;
  salesperson: string;
};

type ClawbackDetail = {
  id: number;
  policy?: { number: string; product: string | null };
  cancellation_date: string;
  status: string;
  reason?: string | null;
  notes?: string | null;
  items: Array<{
    id: number;
    agent: string;
    agent_id: number;
    entry_type: string;
    original_amount: number;
    clawback_amount: number;
    meta?: {
      period_type?: string;
      period_start?: string;
      period_end?: string;
      volume_delta?: number;
    };
  }>;
};

type ClawbackPreview = {
  exists?: boolean;
  totals?: { original?: number; clawback?: number };
  policy?: { number: string };
  rule_factor?: number;
  message?: string;
};

type CancellationForm = {
  policy_number: string;
  cancellation_date: string;
  reason: string;
  notes: string;
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const statusMeta: Record<Row["status"], { label: string; className: string; icon: LucideIcon }> = {
  PENDING: {
    label: "Pending",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: AlertTriangle,
  },
  PROCESSING: {
    label: "Processing",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    icon: Sparkles,
  },
  APPROVED: {
    label: "Approved",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  DENIED: {
    label: "Denied",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: Ban,
  },
};

type ClawbackListResponse = { items: Row[] };

export default function Clawbacks() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detail, setDetail] = useState<ClawbackDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState<Record<number, boolean>>({});

  const authProfile = useMemo(() => Auth.profile(), []);
  const userLevel = authProfile?.level ?? 0;
  const canStage = userLevel >= 1;
  const canModerate = userLevel >= 2;
  const canProcess = userLevel >= 2;
  const canDeny = userLevel >= 2;
  const canApprove = userLevel >= 3;

  const fetchAll = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        const [summaryRes, listRes] = await Promise.all([
          api.get<SummaryResponse>("/clawbacks/summary"),
          api.get<ClawbackListResponse>("/clawbacks", { params: { q: query } }),
        ]);
        setSummary(summaryRes.data ?? null);
        setRows(listRes.data.items ?? []);
        setSelected([]);
      } catch (error) {
        console.error("Failed to load clawbacks dashboard", error);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchAll(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canModerate && selected.length) {
      setSelected([]);
    }
  }, [canModerate, selected]);

  const pendingCount = useMemo(() => {
    if (typeof summary?.pending === "number") return summary.pending;
    return rows.filter((row) => row.status === "PENDING" || row.status === "PROCESSING").length;
  }, [rows, summary?.pending]);

  const totalExposure = useMemo(() => {
    if (typeof summary?.impact === "number") return summary.impact;
    return rows.reduce((sum, row) => sum + (row.amount || 0), 0);
  }, [rows, summary?.impact]);

  const averageClawback = useMemo(() => {
    if (typeof summary?.avg === "number") return summary.avg;
    if (!rows.length) return 0;
    return totalExposure / rows.length;
  }, [rows.length, summary?.avg, totalExposure]);

  const countsByStatus = useMemo(
    () =>
      rows.reduce<Record<Row["status"], number>>(
        (acc, row) => {
          acc[row.status] += 1;
          return acc;
        },
        {
          PENDING: 0,
          PROCESSING: 0,
          APPROVED: 0,
          DENIED: 0,
        }
      ),
    [rows]
  );

  const selectedExposure = useMemo(
    () =>
      rows
        .filter((row) => selected.includes(row.id))
        .reduce((sum, row) => sum + (row.amount || 0), 0),
    [rows, selected]
  );

  const topPending = useMemo(
    () =>
      rows
        .filter((row) => row.status === "PENDING" || row.status === "PROCESSING")
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3),
    [rows]
  );

  const topReasons = summary?.top_reasons ?? [];
  const bySales = summary?.by_sales ?? [];
  const approvals = summary?.approvals;

  const barData = useMemo(() => {
    const labels = (summary?.trend ?? []).map((point) => point.label);
    const datasetValues = (summary?.trend ?? []).map((point) => point.value ?? 0);
    return {
      labels,
      datasets: [
        {
          label: "Clawback Value",
          data: datasetValues,
          backgroundColor: datasetValues.map(() => "rgba(244, 114, 182, 0.85)"),
          hoverBackgroundColor: "rgba(244, 114, 182, 1)",
          borderRadius: 12,
          barThickness: "flex" as const,
        },
      ],
    };
  }, [summary?.trend]);

  const barOptions = useMemo(
    () => ({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: TooltipItem<"bar">) => {
              const value = typeof context.parsed?.y === "number" ? context.parsed.y : 0;
              return formatCurrency(value);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#475569" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#475569",
            callback: (value: number | string) =>
              typeof value === "number" ? compactCurrencyFormatter.format(value) : value,
          },
          grid: { color: "rgba(226, 232, 240, 0.4)", drawTicks: false },
        },
      },
      maintainAspectRatio: false,
    }),
    []
  );

  const hasSelection = selected.length > 0;
  const showModerationBanner = hasSelection && canModerate;
  const isInitialLoad = loading && rows.length === 0;
  const isRefreshing = loading && rows.length > 0;

  const heroStats: Array<{ label: string; value: string; helper: string; icon: LucideIcon }> = [
    {
      label: "Pending cases",
      value: pendingCount.toString(),
      helper: approvals?.pending
        ? `${approvals.pending} awaiting adjudication`
        : "Awaiting adjudication",
      icon: Clock,
    },
    {
      label: "At-risk payouts",
      value: formatCurrency(totalExposure),
      helper: "If decisions stay unresolved",
      icon: TrendingDown,
    },
    {
      label: "Avg clawback",
      value: formatCurrency(averageClawback),
      helper: "Per cancelled policy",
      icon: FileWarning,
    },
  ];

  const handleSearch = useCallback(() => {
    void fetchAll(q);
  }, [fetchAll, q]);

  const resetFilters = useCallback(() => {
    setQ("");
    void fetchAll("");
  }, [fetchAll]);

  const handleBulkAction = useCallback(
    async (action: "approve" | "deny" | "process") => {
      if (!selected.length) return;
      if (
        (action === "approve" && !canApprove) ||
        (action === "deny" && !canDeny) ||
        (action === "process" && !canProcess)
      ) {
        return;
      }
      setBulkLoading(true);
      try {
        const endpoint =
          action === "approve"
            ? "/clawbacks/approve"
            : action === "deny"
            ? "/clawbacks/deny"
            : "/clawbacks/process";
        await api.post(endpoint, { ids: selected });
        await fetchAll(q);
      } catch (error) {
        console.error(`Failed to ${action} selected clawbacks`, error);
      } finally {
        setBulkLoading(false);
      }
    },
    [canApprove, canDeny, canProcess, fetchAll, q, selected]
  );

  const openDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get<ClawbackDetail>(`/clawbacks/${id}`);
      setDetail(data);
      setDetailModalOpen(true);
    } catch (error) {
      console.error("Failed to load clawback detail", error);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleSelection = (id: number, checked: boolean) => {
    if (!canModerate) return;
    setSelected((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter((entry) => entry !== id);
    });
  };

  const updateStatus = useCallback(
    async (id: number, currentStatus: Row["status"], nextStatus: Row["status"]) => {
      if (currentStatus === nextStatus || nextStatus === "PENDING" || !canModerate) {
        return;
      }
      if (nextStatus === "APPROVED" && !canApprove) return;
      if (nextStatus === "DENIED" && !canDeny) return;
      if (nextStatus === "PROCESSING" && !canProcess) return;
      setStatusBusy((prev) => ({ ...prev, [id]: true }));
      try {
        const endpoint =
          nextStatus === "APPROVED"
            ? "/clawbacks/approve"
            : nextStatus === "DENIED"
            ? "/clawbacks/deny"
            : "/clawbacks/process";
        await api.post(endpoint, { ids: [id] });
        await fetchAll(q);
      } catch (error) {
        console.error(`Failed to update clawback #${id} status`, error);
      } finally {
        setStatusBusy((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [canApprove, canDeny, canModerate, canProcess, fetchAll, q]
  );

  return (
    <div className="space-y-8 pb-14">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-indigo-600 to-slate-900 p-8 text-white shadow-2xl">
        <div className="pointer-events-none absolute inset-0 opacity-50 mix-blend-screen">
          <div className="absolute -left-16 top-12 h-48 w-48 rounded-full bg-white/25 blur-3xl" />
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-fuchsia-400/30 blur-3xl" />
          <div className="absolute -bottom-20 right-10 h-60 w-60 rounded-full bg-indigo-400/30 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-5 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-100 shadow-sm">
              <ShieldAlert className="h-4 w-4" />
              Retention Control Center
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Clawback Management</h1>
              <p className="text-sm leading-relaxed text-indigo-100/90 sm:text-base">
                Triage cancellations, recover at-risk payouts, and keep executive confidence high. Stay on top of
                clawback exposure before it erodes revenue momentum.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-indigo-50/90">
              <span className="rounded-full bg-white/15 px-3 py-1">
                Queue: {countsByStatus.PENDING} pending · {countsByStatus.PROCESSING} processing · {countsByStatus.APPROVED} approved · {countsByStatus.DENIED} denied
              </span>
              {isRefreshing && <span className="rounded-full bg-white/15 px-3 py-1">Refreshing data…</span>}
            </div>
          </div>

          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white/15 p-5 backdrop-blur">
            {heroStats.map(({ icon: Icon, label, value, helper }) => (
              <div
                key={label}
                className="flex items-start justify-between rounded-2xl bg-white/20 px-4 py-3 text-left shadow-sm transition hover:bg-white/25"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-100">
                    <Icon className="h-4 w-4" />
                    {label}
                  </div>
                  <div className="text-xl font-semibold text-white">{value}</div>
                  <div className="text-xs text-indigo-100/80">{helper}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-indigo-100/70" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {showModerationBanner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm text-indigo-700 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              {selected.length} case{selected.length === 1 ? "" : "s"} selected
            </div>
            <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-indigo-600">
              Exposure {formatCurrency(selectedExposure)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canApprove && (
              <button
                onClick={() => handleBulkAction("approve")}
                disabled={bulkLoading}
                className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkLoading ? "Working…" : "Approve selected"}
              </button>
            )}
            {canDeny && (
              <button
                onClick={() => handleBulkAction("deny")}
                disabled={bulkLoading}
                className="rounded-xl border border-transparent bg-white px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkLoading ? "Working…" : "Deny selected"}
              </button>
            )}
            {canProcess && (
              <button
                onClick={() => handleBulkAction("process")}
                disabled={bulkLoading}
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkLoading ? "Working…" : "Mark processing"}
              </button>
            )}
          </div>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Clock}
          label="Live queue"
          value={pendingCount.toString()}
          helper="Cases awaiting resolution"
          tone="primary"
        />
        <KpiCard
          icon={TrendingDown}
          label="Exposure at risk"
          value={formatCurrency(totalExposure)}
          helper="Across open clawbacks"
          tone="danger"
        />
        <KpiCard
          icon={FileWarning}
          label="Avg clawback"
          value={formatCurrency(averageClawback)}
          helper="Per cancellation"
          tone="muted"
        />
        <KpiCard
          icon={Users}
          label="Top salesperson flagged"
          value={bySales[0]?.name ?? "No cases"}
          helper={`${bySales[0]?.count ?? 0} active clawbacks`}
          tone="muted"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div className="rounded-3xl border border-rose-100 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Monthly trend</p>
              <h3 className="text-lg font-semibold text-slate-900">Clawback velocity</h3>
              <p className="text-sm text-slate-500">Spot spikes before they spiral into revenue surprises.</p>
            </div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-500">
              {(summary?.trend?.length ?? 0) || "No"} data points
            </span>
          </div>
          <div className="mt-4 h-72">
            <Bar data={barData} options={barOptions} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-indigo-100 bg-white/80 p-6 shadow-sm backdrop-blur">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Priority follow-ups</p>
                <h3 className="text-lg font-semibold text-slate-900">High-impact cancellations</h3>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-500">
                {topPending.length || "No"} surfaced
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {topPending.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-700"
                >
                  <div>
                    <div className="font-semibold text-indigo-900">{row.policy_number}</div>
                    <div className="text-xs text-indigo-600/80">
                      {formatDate(row.cancellation_date)} · {row.salesperson}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-indigo-900">{formatCurrency(row.amount)}</div>
                    <button
                      onClick={() => openDetail(row.id)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      Review <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {!topPending.length && (
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/60 px-4 py-6 text-center text-xs text-indigo-500">
                  No urgent clawbacks detected. Enjoy the calm!
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Root causes</p>
            <h3 className="text-lg font-semibold text-slate-900">Why customers cancel</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {topReasons.length ? (
                topReasons.map((reason) => (
                  <span
                    key={reason.label}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    {reason.label} · {reason.count}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
                  <FileWarning className="h-4 w-4" />
                  Root causes data unavailable
                </span>
              )}
            </div>
            <div className="mt-4 text-xs text-slate-500">
              Use these insights to coach reps and protect renewal pipelines proactively.
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <div className="md:w-72">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch();
                }}
                placeholder="Filter by policy, customer, or salesperson"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="flex items-center gap-2 pt-1 md:pt-6">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Apply filter
              </button>
              <button
                onClick={resetFilters}
                disabled={!q || loading}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowModal(true)}
              disabled={!canStage}
              title={!canStage ? "Only authenticated agents can stage cancellations." : undefined}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              New cancellation
            </button>
            <span className="text-xs text-slate-500">Keep data fresh—log cancellations the moment they happen.</span>
            {!canModerate && (
              <span className="text-xs font-medium text-slate-400">Team Lead access required to process or deny cases.</span>
            )}
            {canModerate && !canApprove && (
              <span className="text-xs font-medium text-slate-400">Manager or Director access required to approve cases.</span>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="overflow-hidden rounded-3xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 w-12">
                  <span className="sr-only">Select row</span>
                </th>
                <th className="px-4 py-3 font-semibold">Policy / Customer</th>
                <th className="px-4 py-3 font-semibold">Cancellation date</th>
                <th className="px-4 py-3 font-semibold">Original commission</th>
                <th className="px-4 py-3 font-semibold">Clawback amount</th>
                <th className="px-4 py-3 font-semibold">Salesperson</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoad ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12">
                    <div className="space-y-3">
                      <div className="h-3 w-full rounded-full bg-slate-200/70 animate-pulse" />
                      <div className="h-3 w-full rounded-full bg-slate-200/70 animate-pulse" />
                      <div className="h-3 w-2/3 rounded-full bg-slate-200/70 animate-pulse" />
                    </div>
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row) => {
                  const isSelected = selected.includes(row.id);
                  const status = statusMeta[row.status];
                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-slate-100 transition hover:bg-indigo-50/50 ${
                        isSelected ? "bg-indigo-50/40" : "bg-white"
                      }`}
                    >
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canModerate}
                          onChange={(event) => toggleSelection(row.id, event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-slate-800">{row.policy_number}</div>
                        <div className="text-xs text-slate-500">Customer info unavailable</div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600">{formatDate(row.cancellation_date)}</td>
                      <td className="px-4 py-3 align-top font-semibold text-slate-700">
                        {formatCurrency(row.original_amount)}
                      </td>
                      <td className="px-4 py-3 align-top font-semibold text-rose-600">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600">{row.salesperson}</td>
                      <td className="px-4 py-3 align-top">
                        {(row.status === "PENDING" || row.status === "PROCESSING") && canModerate ? (
                          <div className="flex items-center gap-2">
                            <StatusBadge status={row.status} meta={status} />
                            <select
                              value={row.status}
                              onChange={(event) =>
                                updateStatus(row.id, row.status, event.target.value as Row["status"])
                              }
                              disabled={statusBusy[row.id]}
                              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="PENDING">Pending</option>
                              <option value="PROCESSING" disabled={!canProcess}>
                                Process
                              </option>
                              <option value="APPROVED" disabled={!canApprove}>
                                Approve
                              </option>
                              <option value="DENIED" disabled={!canDeny}>
                                Deny
                              </option>
                            </select>
                          </div>
                        ) : (
                          <StatusBadge status={row.status} meta={status} />
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button
                          onClick={() => openDetail(row.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100"
                        >
                          Details
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                    No clawbacks yet. When cancellations occur, they will be staged here for rapid resolution.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <NewCancellationModal
          canSubmit={canStage}
          onClose={() => setShowModal(false)}
          onCreated={async () => {
            setShowModal(false);
            await fetchAll(q);
          }}
        />
      )}

      {detailModalOpen && (
        <DetailModal
          loading={detailLoading}
          detail={detail}
          onClose={() => {
            setDetailModalOpen(false);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
  tone?: "primary" | "danger" | "muted";
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-600"
      : tone === "muted"
      ? "border-slate-200 bg-white text-slate-700"
      : "border-indigo-200 bg-indigo-50 text-indigo-700";
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md ${toneClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-current/80">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{helper}</p>
        </div>
        <div className="rounded-full bg-white/70 p-3 text-current">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, meta }: { status: Row["status"]; meta: (typeof statusMeta)[Row["status"]] }) {
  const Icon = meta.icon;
  return (
    <span
      data-status={status.toLowerCase()}
      aria-label={`Status: ${meta.label}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function InfoLine({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-800">{value ?? "—"}</div>
    </div>
  );
}

function NewCancellationModal({
  canSubmit,
  onClose,
  onCreated,
}: {
  canSubmit: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState<CancellationForm>({
    policy_number: "",
    cancellation_date: "",
    reason: "Customer request",
    notes: "",
  });
  const [preview, setPreview] = useState<ClawbackPreview | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const change = (key: keyof CancellationForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!form.policy_number || !form.cancellation_date) {
      setPreview(null);
      return;
    }

    let active = true;
    const runAnalysis = async () => {
      setAnalyzing(true);
      try {
        const { data } = await api.get<ClawbackPreview>("/clawbacks/preview", { params: form });
        if (active) setPreview(data);
      } catch (error) {
        console.error("Failed to preview clawback impact", error);
        if (active) {
          setPreview({
            exists: false,
            message: "Unable to calculate impact right now. Try again shortly.",
          });
        }
      } finally {
        if (active) setAnalyzing(false);
      }
    };

    void runAnalysis();
    return () => {
      active = false;
    };
  }, [form]);

  const submit = async () => {
    if (!canSubmit || !form.policy_number || !form.cancellation_date) return;
    setSubmitting(true);
    try {
      const { data } = await api.post("/clawbacks", form);
      if (data?.id) await onCreated();
    } catch (error) {
      console.error("Failed to submit cancellation", error);
    } finally {
      setSubmitting(false);
    }
  };

  const previewExists = Boolean(preview?.exists);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600">
              <ShieldAlert className="h-3.5 w-3.5" />
              Cancellation intake
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">Stage a clawback</h2>
            <p className="text-sm text-slate-500">
              Capture the cancellation details and instantly calculate the impact before sending for approval.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/70 p-2 text-slate-400 transition hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-12">
          <div className="space-y-4 md:col-span-7">
            <label className="block text-sm text-slate-700">
              Policy number
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={form.policy_number}
                onChange={(event) => change("policy_number", event.target.value)}
                placeholder="Enter policy number"
              />
            </label>

            <label className="block text-sm text-slate-700">
              Cancellation date
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={form.cancellation_date}
                onChange={(event) => change("cancellation_date", event.target.value)}
              />
            </label>

            <label className="block text-sm text-slate-700">
              Reason for cancellation
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={form.reason}
                onChange={(event) => change("reason", event.target.value)}
              >
                <option>Customer request</option>
                <option>Non-payment</option>
                <option>Duplicate policy</option>
                <option>Fraud suspected</option>
              </select>
            </label>

            <label className="block text-sm text-slate-700">
              Notes
              <textarea
                className="mt-1 h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={form.notes}
                onChange={(event) => change("notes", event.target.value)}
                placeholder="Add any relevant context for reviewers…"
              />
            </label>
          </div>

          <div className="space-y-4 md:col-span-5">
            <div className="h-full rounded-3xl border border-rose-100 bg-rose-50/60 p-5 text-rose-700 shadow-inner">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Impact analysis</p>
                  <p className="text-lg font-semibold text-rose-700">Potential clawback</p>
                </div>
                <span className="rounded-full bg-white/40 px-3 py-1 text-xs font-semibold text-rose-600">
                  {analyzing ? "Calculating…" : previewExists ? "Preview ready" : "Awaiting data"}
                </span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {!preview ? (
                  <p className="text-rose-600/80">Enter a policy number and date to preview the financial impact.</p>
                ) : previewExists ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                        Original commission
                      </p>
                      <p className="text-2xl font-semibold text-rose-800">
                        {formatCurrency(preview.totals?.original ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                        Clawback amount
                      </p>
                      <p className="text-2xl font-semibold text-rose-800">
                        {formatCurrency(preview.totals?.clawback ?? 0)}
                      </p>
                    </div>
                    <div className="text-xs text-rose-600/80">
                      Policy {preview.policy?.number ?? "—"} · Rule factor{" "}
                      {preview.rule_factor ? `${Math.round(preview.rule_factor * 100)}%` : "—"}
                    </div>
                  </>
                ) : (
                  <p className="text-rose-600/80">{preview.message ?? "No data available for this policy."}</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-inner">
              <p className="font-semibold text-slate-700">Retention tip</p>
              <p className="mt-2">
                Share the preview with the originating salesperson to surface renewal save opportunities before
                the clawback is finalised.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!previewExists || submitting || !canSubmit}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            title={!canSubmit ? "You no longer have permission to submit cancellations." : undefined}
          >
            {submitting ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  detail,
  loading,
  onClose,
}: {
  detail: ClawbackDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const normalizedStatus = useMemo(() => {
    const status = detail?.status?.toUpperCase?.();
    if (!status) return null;
    if (status === "PENDING" || status === "PROCESSING" || status === "APPROVED" || status === "DENIED") {
      return status as Row["status"];
    }
    return null;
  }, [detail?.status]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur">
      <div className="relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-4 backdrop-blur-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clawback detail</p>
            <h2 className="text-lg font-semibold text-slate-900">Policy #{detail?.policy?.number ?? "—"}</h2>
            <p className="text-xs text-slate-500">{detail?.policy?.product ?? "Product information unavailable"}</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/70 p-2 text-slate-400 transition hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading detail…</div>
          ) : !detail ? (
            <div className="p-8 text-center text-sm text-slate-500">No detail available.</div>
          ) : (
            <div className="space-y-6 p-6">
              <div className="grid gap-3 md:grid-cols-2">
                <InfoLine label="Cancellation date" value={formatDate(detail.cancellation_date)} />
                {normalizedStatus ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</div>
                    <StatusBadge status={normalizedStatus} meta={statusMeta[normalizedStatus]} />
                  </div>
                ) : (
                  <InfoLine label="Status" value={detail.status} />
                )}
                {detail.reason && <InfoLine label="Reason" value={detail.reason} />}
                {detail.notes && <InfoLine label="Notes" value={detail.notes} />}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 shadow-inner">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Impacted participants</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                    {detail.items.length} record{detail.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Agent</th>
                        <th className="px-3 py-2 text-left font-semibold">Entry type</th>
                        <th className="px-3 py-2 text-left font-semibold">Original</th>
                        <th className="px-3 py-2 text-left font-semibold">Clawback</th>
                        <th className="px-3 py-2 text-left font-semibold">Meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.length ? (
                        detail.items.map((item) => (
                          <tr key={item.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-700">{item.agent}</td>
                            <td className="px-3 py-2 text-slate-600">{item.entry_type}</td>
                            <td className="px-3 py-2 font-semibold text-slate-700">
                              {formatCurrency(item.original_amount)}
                            </td>
                            <td className="px-3 py-2 font-semibold text-rose-600">
                              {formatCurrency(item.clawback_amount)}
                            </td>
                            <td className="px-3 py-2 text-slate-500">
                              {item.meta
                                ? [
                                    item.meta.period_type && `Period: ${item.meta.period_type}`,
                                    item.meta.period_start && `Start: ${item.meta.period_start}`,
                                    item.meta.period_end && `End: ${item.meta.period_end}`,
                                    item.meta.volume_delta !== undefined &&
                                      `Volume Δ: ${formatCurrency(item.meta.volume_delta)}`,
                                  ]
                                    .filter(Boolean)
                                    .join(" • ")
                                : "—"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                            No impacted participants recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
