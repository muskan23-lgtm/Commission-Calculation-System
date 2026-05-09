// src/pages/Sales.tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Info, Sparkles, Target, TrendingUp } from "lucide-react";
import api from "../api/client";

/* ---------- Types ---------- */
type Agent = { id: number; name: string; level: number };
type HistoryItem = {
  id: number;
  policy_number: string;
  sales_rep: string | number;
  customer: string;
  product: string;
  amount: number;
  date: string;
};

type StatusMessage = { type: "success" | "error" | "info"; message: string };
type DealTemplate = {
  label: string;
  product: string;
  fyc_rate?: string;
  premium?: string;
  notes?: string;
  customer_name?: string;
};

const ROLE_BY_LEVEL: Record<number, string> = {
  1: "Agent",
  2: "Team Lead",
  3: "Manager",
  4: "Director",
};

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const formatCurrency = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "₹0";
  return INR.format(Math.round(value));
};
const formatPercent = (value: number) => `${Math.round((value || 0) * 100)}%`;

/* ---------- Page ---------- */
export default function Sales() {
  const [tab, setTab] = useState<"create" | "history" | "lookup">("create");
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Sales Management</h1>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-purple-600 to-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-100">
              <Sparkles size={18} className="text-white" />
              <span>Experience-led selling workspace</span>
            </div>
            <div className="mt-2 text-2xl font-semibold">Keep executives coming back every day</div>
            <p className="mt-1 text-sm text-indigo-100/90">
              Reserve policy numbers instantly, preview commissions live, and launch proven templates in seconds.
            </p>
          </div>
          <div className="grid w-full gap-3 rounded-2xl bg-white/10 p-4 text-sm md:w-auto md:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-indigo-100">Auto policy IDs</div>
              <div className="text-white">Sequential and conflict-free with one tap.</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-indigo-100">Commission simulator</div>
              <div className="text-white">Sale values instantly convert to payouts.</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-indigo-100">Template library</div>
              <div className="text-white">Curated deals your team reuses again and again.</div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -left-8 bottom-0 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur px-4">
        <div className="flex gap-6">
          <TabButton active={tab === "create"} onClick={() => setTab("create")} label="Record New Sale" />
          <TabButton active={tab === "history"} onClick={() => setTab("history")} label="Sales History" />
          <TabButton active={tab === "lookup"} onClick={() => setTab("lookup")} label="Policy Lookup" />
        </div>
      </div>

      {tab === "create" && <RecordNewSale />}
      {tab === "history" && <SalesHistory />}
      {tab === "lookup" && <PolicyLookup />}
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative py-3 text-sm ${active ? "text-indigo-600 font-semibold" : "text-gray-600 hover:text-gray-900"}`}
    >
      {label}
      {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-indigo-600 rounded-full" />}
    </button>
  );
}

/* ===================== Record New Sale (with Seller dropdown) ===================== */

function RecordNewSale() {
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const [form, setForm] = useState({
    customer_name: "",
    product: "",
    sale_date: "",
    premium: "",
    mobile: "",
    gender: "",
    notes: "",
    seller_id: "",
    policy_number: "",
    fyc_rate: "0.5",
  });

  const clearCoreFields = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      customer_name: "",
      product: "",
      sale_date: "",
      premium: "",
      mobile: "",
      gender: "",
      notes: "",
    }));
  }, []);

  const fetchNextPolicyNumber = useCallback(async (withMessage = false) => {
    setPolicyLoading(true);
    try {
      const { data } = await api.get("/sales/next-policy-number");
      if (data?.next_policy_number) {
        setForm((s) => ({ ...s, policy_number: data.next_policy_number }));
        if (withMessage) {
          setStatus({ type: "info", message: `Reserved policy number ${data.next_policy_number} for this entry.` });
        }
        return;
      }
    } catch (error) {
      console.error("Failed to load next policy number", error);
      if (withMessage) {
        setStatus({ type: "error", message: "Couldn't reach the server. You can still enter a policy number manually." });
      }
    } finally {
      setPolicyLoading(false);
    }

    let fallbackNotice: StatusMessage | null = null;
    setForm((s) => {
      if (!s.policy_number) {
        fallbackNotice = withMessage ? { type: "info", message: "Offline mode enabled. Starting at POL-1001." } : null;
        return { ...s, policy_number: "POL-1001" };
      }
      const match = s.policy_number.match(/POL-(\d+)/);
      if (match) {
        const next = parseInt(match[1], 10) + 1;
        fallbackNotice = withMessage ? { type: "info", message: `Policy number bumped to POL-${next}.` } : null;
        return { ...s, policy_number: `POL-${next}` };
      }
      return s;
    });
    if (fallbackNotice) {
      setStatus(fallbackNotice);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/agents");
        setAgents(data);
        if (data?.length) {
          setForm((s) => (s.seller_id ? s : { ...s, seller_id: String(data[0].id) }));
        }
      } finally {
        setAgentsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    fetchNextPolicyNumber();
  }, [fetchNextPolicyNumber]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const change = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const metrics = useMemo(() => {
    const premiumNum = parseFloat(form.premium || "0");
    const rateNum = parseFloat(form.fyc_rate || "0");
    const premium = Number.isFinite(premiumNum) && premiumNum > 0 ? premiumNum : 0;
    const fycRate = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : 0;
    const estimatedCommission = premium && fycRate ? premium * fycRate : 0;
    const progress = premium ? Math.min(100, Math.round((premium / 200000) * 100)) : 0;
    return { premium, fycRate, estimatedCommission, progress };
  }, [form.premium, form.fyc_rate]);

  const templates: DealTemplate[] = useMemo(
    () => [
      {
        label: "Family Protection Plan",
        product: "Term Life",
        fyc_rate: "0.55",
        premium: "150000",
        notes: "High-conversion family coverage with loyalty riders.",
      },
      {
        label: "Health Shield Bundle",
        product: "Health Shield",
        fyc_rate: "0.45",
        premium: "90000",
        notes: "Balanced protection + wellness coach upsell.",
      },
      {
        label: "Wealth Builder ULIP",
        product: "Investment ULIP",
        fyc_rate: "0.6",
        premium: "250000",
        notes: "For returning premium clients seeking growth.",
      },
    ],
    []
  );

  const applyTemplate = (template: DealTemplate) => {
    setForm((prev) => ({
      ...prev,
      product: template.product,
      fyc_rate: template.fyc_rate ?? prev.fyc_rate,
      premium: template.premium ?? prev.premium,
      notes: template.notes ?? prev.notes,
      customer_name: template.customer_name ?? prev.customer_name,
    }));
    setStatus({ type: "info", message: `Loaded ${template.label}. Personalize before saving.` });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!form.seller_id) {
      setStatus({ type: "error", message: "Please choose the seller responsible for this sale." });
      return;
    }
    if (!form.policy_number) {
      setStatus({ type: "error", message: "Policy number missing. Tap refresh to generate one automatically." });
      return;
    }
    if (!form.premium || isNaN(Number(form.premium))) {
      setStatus({ type: "error", message: "Enter a numeric sale amount so commissions can be calculated." });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customer_name: form.customer_name || undefined,
        product: form.product || undefined,
        sale_date: form.sale_date || undefined,
        premium: parseFloat(form.premium),
        mobile: form.mobile || undefined,
        gender: form.gender || undefined,
        notes: form.notes || undefined,
        seller_id: parseInt(form.seller_id),
        policy_number: form.policy_number,
        fyc_rate: parseFloat(form.fyc_rate || "0.5"),
      };
      const { data } = await api.post("/sales", payload);
      setStatus({
        type: "success",
        message: `Sale ${data?.policy_number || form.policy_number} recorded. Commission reminders sent.`,
      });
      setForm((prev) => ({
        ...prev,
        customer_name: "",
        product: "",
        sale_date: "",
        premium: "",
        mobile: "",
        gender: "",
        notes: "",
        policy_number: data?.policy_number || prev.policy_number,
      }));
      await fetchNextPolicyNumber();
    } catch (error: any) {
      const message = error?.response?.data?.error || "Unable to record the sale right now.";
      setStatus({ type: "error", message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-indigo-600">
                <Sparkles size={18} />
                <span className="text-xs font-semibold uppercase tracking-wide">Guided capture</span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Record a new sale</h3>
              <p className="mt-1 text-sm text-slate-500">
                Auto policy numbers, instant commission previews, and curated templates keep executives returning daily.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-right">
              <div className="text-xs font-medium uppercase tracking-wide text-indigo-500">Next policy</div>
              <div className="text-lg font-semibold text-indigo-700">
                {form.policy_number || (policyLoading ? "Generating…" : "Tap refresh")}
              </div>
              <button
                type="button"
                onClick={() => fetchNextPolicyNumber(true)}
                className="mt-1 text-xs font-medium text-indigo-600 transition hover:text-indigo-700 disabled:opacity-60"
                disabled={policyLoading}
              >
                {policyLoading ? "Reserving…" : "Refresh"}
              </button>
            </div>
          </div>

          {status && <StatusBanner status={status} />}

          <form className="mt-6 space-y-8" onSubmit={submit}>
            <div className="space-y-4">
              <SectionTitle
                icon={<Sparkles size={16} />}
                title="Customer & contact"
                subtitle="Capture essentials so service teams can follow up instantly."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Customer Name"
                  placeholder="Enter customer name"
                  value={form.customer_name}
                  onChange={(v) => change("customer_name", v)}
                  hint="We’ll use this for reports and receipts."
                />
                <Input
                  label="Mobile Number"
                  placeholder="Enter mobile number"
                  value={form.mobile}
                  onChange={(v) => change("mobile", v)}
                  hint="Add a contact for quick callbacks."
                />
                <Input
                  label="Product / Service"
                  placeholder="Enter product or service"
                  value={form.product}
                  onChange={(v) => change("product", v)}
                  hint="This keeps product mix reporting accurate."
                />
                <Input
                  label="Sale Date"
                  type="date"
                  placeholder="yyyy-mm-dd"
                  value={form.sale_date}
                  onChange={(v) => change("sale_date", v)}
                  hint="Defaults to today if left blank."
                />
                <Input
                  label="Sale Amount (₹)"
                  placeholder="e.g., 150000"
                  value={form.premium}
                  onChange={(v) => change("premium", v)}
                  hint="Gross premium before bonuses."
                />
                <Select
                  label="Gender"
                  value={form.gender}
                  onChange={(v) => change("gender", v)}
                  options={[
                    { label: "Select Gender", value: "" },
                    { label: "Male", value: "Male" },
                    { label: "Female", value: "Female" },
                    { label: "Other", value: "Other" },
                  ]}
                  hint="Used for personalized follow-up messaging."
                />
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle
                icon={<Target size={16} />}
                title="Deal specifics"
                subtitle="Assign ownership, confirm policy numbers, and tune payouts."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-500">Seller (Agent)</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
                    value={form.seller_id}
                    onChange={(e) => change("seller_id", e.target.value)}
                    disabled={agentsLoading}
                  >
                    {agentsLoading && <option value="">Loading agents…</option>}
                    {!agentsLoading && agents.length === 0 && <option value="">No agents found</option>}
                    {agents.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.name} ({ROLE_BY_LEVEL[a.level] || `L${a.level}`}) – ID: {a.id}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">Spotlight who closed the deal to fuel recognition.</p>
                </div>
                <Input
                  label="Policy Number"
                  placeholder="e.g., POL-1001"
                  value={form.policy_number}
                  onChange={(v) => change("policy_number", v)}
                  hint="Auto-generated, but you can customise it for legacy systems."
                />
                <Input
                  label="FYC Rate"
                  placeholder="0.5"
                  value={form.fyc_rate}
                  onChange={(v) => change("fyc_rate", v)}
                  hint="Decimal form. 0.5 equals 50% commissions."
                />
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle
                icon={<TrendingUp size={16} />}
                title="Commission notes"
                subtitle="Promote clarity—add nuance for finance & compliance."
              />
              <TextArea
                className="md:col-span-2"
                label="Commission Details"
                placeholder="Add notes about the commission..."
                value={form.notes}
                onChange={(v) => change("notes", v)}
                hint="E.g. payout schedule, special incentives, or clawback rules."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-sm text-slate-500">
                Estimated payout: {" "}
                <span className="font-semibold text-slate-900">{formatCurrency(metrics.estimatedCommission)}</span>{" "}
                at {formatPercent(metrics.fycRate)} FYC
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearCoreFields();
                    setStatus({ type: "info", message: "Form cleared. Policy number preserved." });
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Reset form
                </button>
                <button
                  type="button"
                  onClick={() => nav("/")}
                  className="rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  Back to dashboard
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "➕ Record sale"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="space-y-4 lg:col-span-4">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-slate-900 p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-indigo-100">
            <TrendingUp size={16} />
            Live deal snapshot
          </div>
          <div className="mt-3 text-2xl font-semibold">{formatCurrency(metrics.premium)}</div>
          <p className="text-sm text-indigo-100">Projected premium so far.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MetricTile label="Estimated FYC" value={formatCurrency(metrics.estimatedCommission)} />
            <MetricTile label="FYC rate" value={formatPercent(metrics.fycRate)} />
            <MetricTile label="Policy number" value={form.policy_number || "—"} />
            <MetricTile label="Progress" value={`${metrics.progress}% towards ₹2L`} />
          </div>
          <div className="mt-5 h-2 rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${Math.max(metrics.progress, metrics.progress > 0 ? 6 : 0)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-indigo-100">Keep logging sales to unlock daily kudos on the leaderboard.</p>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Sparkles size={16} className="text-indigo-500" />
            One-click templates
          </h4>
          <p className="mt-1 text-xs text-slate-500">Fast-track repeatable deals that executives love to revisit.</p>
          <div className="mt-4 space-y-2">
            {templates.map((template) => (
              <button
                type="button"
                key={template.label}
                onClick={() => applyTemplate(template)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm transition hover:border-indigo-400 hover:bg-indigo-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{template.label}</span>
                  <span className="text-xs font-medium text-indigo-500">
                    {template.fyc_rate ? `${formatPercent(parseFloat(template.fyc_rate))} FYC` : "Flexible"}
                  </span>
                </div>
                {template.notes && <p className="mt-1 text-xs text-slate-500">{template.notes}</p>}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Target size={16} className="text-indigo-500" />
            Keep executives engaged
          </h4>
          <ul className="mt-3 space-y-3 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-1 block h-2 w-2 rounded-full bg-indigo-500" />
              Offer instant visual feedback so teams celebrate every win together.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 block h-2 w-2 rounded-full bg-indigo-500" />
              Save templates and automation—they return because it feels effortless.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 block h-2 w-2 rounded-full bg-indigo-500" />
              Encourage daily streaks with friendly targets and contextual nudges.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
/* ---------- Small inputs ---------- */

function Input({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  className = "",
  hint,
  disabled,
}: {
  label: string;
  placeholder?: string;
  value: string;
  type?: string;
  onChange: (v: string) => void;
  className?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <input
        type={type}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function TextArea({
  label,
  placeholder,
  value,
  onChange,
  className = "",
  hint,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <textarea
        className="mt-1 h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  className = "",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <select
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function StatusBanner({ status }: { status: StatusMessage }) {
  const tone = {
    success: {
      wrapper: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: "text-emerald-500",
      Icon: CheckCircle2,
    },
    error: {
      wrapper: "border-rose-200 bg-rose-50 text-rose-700",
      icon: "text-rose-500",
      Icon: AlertTriangle,
    },
    info: {
      wrapper: "border-indigo-200 bg-indigo-50 text-indigo-700",
      icon: "text-indigo-500",
      Icon: Info,
    },
  }[status.type];
  const Icon = tone.Icon;
  return (
    <div className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${tone.wrapper}`}>
      <Icon size={18} className={`mt-0.5 ${tone.icon}`} />
      <p>{status.message}</p>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-full bg-indigo-50 p-2 text-indigo-600">{icon}</div>
      <div>
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-indigo-100">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

/* ===================== Sales History ===================== */

function SalesHistory() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(8);
  const [data, setData] = useState<{ items: HistoryItem[]; page: number; limit: number; total: number }>({
    items: [],
    page: 1,
    limit,
    total: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(
    async (p: number, query: string) => {
      setLoading(true);
      try {
        const { data } = await api.get("/sales/history", { params: { page: p, limit, q: query } });
        setData(data);
        setPage(p);
      } finally {
        setLoading(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    fetchData(1, "");
  }, [fetchData]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data.total || 0) / limit)),
    [data.total, limit]
  );
  const pageTotal = useMemo(
    () => data.items.reduce((sum, r) => sum + r.amount, 0),
    [data.items]
  );

  const quickFilters = [
    { label: "Term life wins", value: "Term" },
    { label: "Health shield", value: "Health" },
    { label: "Investment ULIP", value: "ULIP" },
  ];

  const handleSearch = useCallback(() => {
    const query = q.trim();
    setPage(1);
    fetchData(1, query);
  }, [fetchData, q]);

  const currentQuery = q.trim();

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Sales timeline</div>
            <h3 className="mt-1 text-xl font-bold text-slate-900">Recent activity</h3>
            <p className="text-sm text-slate-500">Search by customer, product, or mobile—keep teams aligned on every deal.</p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto">
            <div className="flex items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 md:w-64"
                placeholder="Search (name, product, phone)"
              />
                <button
                  onClick={handleSearch}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Search
                </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Quick filters:</span>
              {quickFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setQ(filter.value);
                    setPage(1);
                    fetchData(1, filter.value);
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Policy #</th>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Product</th>
                <th className="px-4 py-3 text-left font-semibold">Sales Rep</th>
                <th className="px-4 py-3 text-left font-semibold">Amount</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <div className="flex flex-col gap-3">
                      <div className="h-3 rounded-full bg-slate-200/80 animate-pulse" />
                      <div className="h-3 rounded-full bg-slate-200/70 animate-pulse" />
                      <div className="h-3 rounded-full bg-slate-200/60 animate-pulse" />
                    </div>
                  </td>
                </tr>
              ) : data.items.length ? (
                data.items.map((r) => (
                  <tr key={r.id} className="transition hover:bg-indigo-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.policy_number}</td>
                    <td className="px-4 py-3 text-slate-600">{r.customer}</td>
                    <td className="px-4 py-3 text-slate-600">{r.product}</td>
                    <td className="px-4 py-3 text-slate-600">{r.sales_rep}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(r.date).toDateString().slice(4)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={6}>
                    No sales yet—log your first deal to light up this timeline.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <div>
            <span className="font-semibold text-slate-900">{data.total}</span> deals captured · This page: {" "}
            <span className="font-semibold text-slate-900">{formatCurrency(pageTotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => {
                if (page <= 1 || loading) return;
                const newPage = page - 1;
                setPage(newPage);
                fetchData(newPage, currentQuery);
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Page {page} of {totalPages}
            </div>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => {
                if (page >= totalPages || loading) return;
                const newPage = page + 1;
                setPage(newPage);
                fetchData(newPage, currentQuery);
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
/* ===================== Policy Lookup ===================== */

function PolicyLookup() {
  const [policy, setPolicy] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const lookup = async (override?: string) => {
    const trimmed = (override ?? policy).trim();
    if (!trimmed) {
      setTouched(true);
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/sales/policy-lookup", { params: { policy_number: trimmed } });
      setResult(data);
    } finally {
      setLoading(false);
      setTouched(true);
    }
  };

  const samplePolicies = ["POL-1001", "POL-1002", "POL-1003"];
  const trimmed = policy.trim();

  let statusMessage: StatusMessage | null = null;
  if (touched && !loading) {
    if (!trimmed) {
      statusMessage = { type: "info", message: "Enter a policy number to begin your lookup." };
    } else if (result?.exists) {
      const count = result.sales?.length || 0;
      statusMessage = {
        type: "success",
        message: `Policy ${result.policy.number} located with ${count} recorded sale${count === 1 ? "" : "s"}.`,
      };
    } else if (result && !result.exists) {
      statusMessage = { type: "error", message: "No policy found with that number. Try another or record a new sale." };
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Policy intelligence</div>
              <h3 className="mt-1 text-xl font-bold text-slate-900">Lookup in seconds</h3>
              <p className="text-sm text-slate-500">Check existing policies, view linked sales, and keep your clawback risk low.</p>
            </div>
            <div className="flex w-full flex-col items-start gap-2 md:w-auto">
              <div className="flex w-full items-center gap-2">
                <input
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") lookup();
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 md:w-72"
                  placeholder="Enter policy number (e.g., POL-1001)"
                />
                <button
                  onClick={() => {
                    void lookup();
                  }}
                  disabled={loading}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Searching…" : "Search"}
                </button>
              </div>
              <div className="text-xs text-slate-500">Use a seeded policy number to see results instantly.</div>
            </div>
          </div>

          {statusMessage && <StatusBanner status={statusMessage} />}

          {result && (
            <div className="mt-6 space-y-4">
              {result.exists ? (
                <>
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-sm text-indigo-700">
                    <div className="text-sm font-semibold text-indigo-900">Policy #{result.policy.number}</div>
                    <div className="text-xs text-indigo-700/80">
                      {result.policy.product || "—"} • FYC {formatPercent(result.policy.fyc_rate)}
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Customer</th>
                          <th className="px-4 py-3 text-left font-semibold">Seller ID</th>
                          <th className="px-4 py-3 text-left font-semibold">Premium</th>
                          <th className="px-4 py-3 text-left font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {result.sales.map((s: any) => (
                          <tr key={s.id} className="transition hover:bg-indigo-50/60">
                            <td className="px-4 py-3 text-slate-600">{s.customer || "-"}</td>
                            <td className="px-4 py-3 text-slate-600">{s.seller_id}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(Number(s.premium))}</td>
                            <td className="px-4 py-3 text-slate-500">{new Date(s.date).toDateString().slice(4)}</td>
                          </tr>
                        ))}
                        {!result.sales.length && (
                          <tr>
                            <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                              No sales recorded for this policy yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  No policy found. Hop over to the "Record New Sale" tab to create it before a competitor does.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 lg:col-span-4">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h4 className="text-sm font-semibold text-slate-800">Instant suggestions</h4>
          <p className="mt-1 text-xs text-slate-500">Try one of the demo policy numbers—perfect for walkthroughs.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {samplePolicies.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPolicy(id);
                  setTouched(false);
                  setResult(null);
                  lookup(id);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h4 className="text-sm font-semibold text-slate-800">Retention tips</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-1 block h-2 w-2 rounded-full bg-indigo-500" />
              Keep policy data clean to avoid clawback surprises.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 block h-2 w-2 rounded-full bg-indigo-500" />
              Cross-reference sales history before approving bonuses.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 block h-2 w-2 rounded-full bg-indigo-500" />
              Encourage executives to bookmark this lookup for daily use.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
