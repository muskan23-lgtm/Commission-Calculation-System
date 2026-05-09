import { useEffect, useMemo, useState, type FormEvent } from "react";
import api from "../api/client";
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  CircleUser,
  Filter,
  Mail,
  Pencil,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

type ExternalIdTemplate = { prefix: string; suffix: string; width: number };

const DEFAULT_EXTERNAL_ID_TEMPLATE: ExternalIdTemplate = { prefix: "AGT-", suffix: "", width: 4 };

function extractExternalNumber(value?: string | null): number | null {
  if (!value) return null;
  const matches = value.match(/\d+/g);
  if (!matches?.length) return null;
  const numeric = parseInt(matches[matches.length - 1], 10);
  return Number.isNaN(numeric) ? null : numeric;
}

function deriveExternalTemplate(value?: string | null): ExternalIdTemplate | null {
  if (!value) return null;
  const match = value.trim().match(/^(.*?)(\d+)([^0-9]*)$/);
  if (!match) return null;
  return { prefix: match[1], width: match[2].length, suffix: match[3] };
}

type Agent = {
  id: number;
  name: string;
  email: string;
  level: number;
  role: string;
  parent_id: number | null;
  external_id?: string | null;
  active: boolean;
  avatar_url?: string | null;
  children?: Agent[];
};

type AgentForm = {
  name: string;
  email: string;
  password: string;
  level: number;
  parent_id: number | null;
  external_id: string;
  active: boolean;
};

type LevelFilter = "all" | 1 | 2 | 3 | 4;

const ROLE_BY_LEVEL: Record<number, string> = {
  1: "Agent",
  2: "Team Lead",
  3: "Manager",
  4: "Director",
};

const LEVEL_FILTERS: Array<{ value: LevelFilter; label: string; helper: string }> = [
  { value: "all", label: "All roles", helper: "Entire org" },
  { value: 4, label: "Directors", helper: "Strategic leaders" },
  { value: 3, label: "Managers", helper: "Mid-level leaders" },
  { value: 2, label: "Team Leads", helper: "Front-line mentors" },
  { value: 1, label: "Agents", helper: "Individual contributors" },
];

const PAGE_SIZE = 10;

const INITIAL_FORM: AgentForm = {
  name: "",
  email: "",
  password: "",
  level: 1,
  parent_id: null,
  external_id: "",
  active: true,
};

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tree, setTree] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<AgentForm>(INITIAL_FORM);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: list }, { data: org }] = await Promise.all([api.get("/agents"), api.get("/agents/tree")]);
      setAgents(list);
      setTree(org);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const parentMap = useMemo(() => {
    const map = new Map<number, Agent>();
    agents.forEach((agent) => {
      map.set(agent.id, agent);
    });
    return map;
  }, [agents]);

  const parentsOptions = useMemo(
    () =>
      agents
        .map((agent) => ({
          id: agent.id,
          label: `${agent.name} (${ROLE_BY_LEVEL[agent.level] ?? `Level ${agent.level}`})`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [agents]
  );

  const externalIdTemplate = useMemo<ExternalIdTemplate>(() => {
    for (const agent of agents) {
      const template = deriveExternalTemplate(agent.external_id);
      if (template) {
        return template;
      }
    }
    return DEFAULT_EXTERNAL_ID_TEMPLATE;
  }, [agents]);

  const nextExternalId = useMemo(() => {
    const template = externalIdTemplate;
    const width = Math.max(template.width || 0, 3);
    let highestNumeric = 0;
    agents.forEach((agent) => {
      const numeric = extractExternalNumber(agent.external_id);
      if (numeric && numeric > highestNumeric) highestNumeric = numeric;
    });
    if (highestNumeric === 0) {
      agents.forEach((agent) => {
        if (agent.id > highestNumeric) highestNumeric = agent.id;
      });
    }
    const nextNumber = highestNumeric + 1;
    const padded = nextNumber.toString().padStart(width, "0");
    const candidate = `${template.prefix ?? ""}${padded}${template.suffix ?? ""}`;
    return candidate.trim();
  }, [agents, externalIdTemplate]);

  const metrics = useMemo(() => {
    const total = agents.length;
    const active = agents.filter((agent) => agent.active).length;
    const inactive = total - active;
    const leaders = agents.filter((agent) => agent.level >= 2).length;
    const directReports = agents.filter((agent) => agent.parent_id !== null).length;
    const activityRate = total ? Math.round((active / total) * 100) : 0;
    return { total, active, inactive, leaders, directReports, activityRate };
  }, [agents]);

  const leadershipSpotlight = useMemo(() => {
    const entries = tree.map((root) => ({
      agent: root,
      teamSize: countTeamSize(root),
      directs: root.children?.length ?? 0,
    }));
    return entries.sort((a, b) => b.teamSize - a.teamSize).slice(0, 3);
  }, [tree]);

  const highlight = leadershipSpotlight[0];

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return agents.filter((agent) => {
      const matchesLevel = levelFilter === "all" || agent.level === levelFilter;
      const supervisorName = agent.parent_id ? parentMap.get(agent.parent_id)?.name ?? "" : "Top-level";
      const matchesQuery =
        !query ||
        [agent.name, agent.email, ROLE_BY_LEVEL[agent.level], agent.external_id, supervisorName]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query));
      return matchesLevel && matchesQuery;
    });
  }, [agents, levelFilter, parentMap, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, levelFilter]);

  useEffect(() => {
    setCurrentPage((prev) => {
      const maxPage = Math.max(1, Math.ceil(filteredAgents.length / PAGE_SIZE));
      return Math.min(prev, maxPage);
    });
  }, [filteredAgents.length]);

  const totalFiltered = filteredAgents.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const paginatedAgents = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredAgents.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredAgents]);
  const pageStart = totalFiltered ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = totalFiltered ? Math.min(currentPage * PAGE_SIZE, totalFiltered) : 0;
  const isFirstPage = currentPage === 1;
  const isLastPage = totalFiltered === 0 || currentPage >= totalPages;

  const openCreate = () => {
    setEditing(null);
    setForm({ ...INITIAL_FORM, external_id: nextExternalId });
    setShowModal(true);
  };

  const openEdit = (agent: Agent) => {
    setEditing(agent);
    setForm({
      name: agent.name,
      email: agent.email,
      password: "",
      level: agent.level,
      parent_id: agent.parent_id,
      external_id: agent.external_id ?? "",
      active: agent.active,
    });
    setShowModal(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPassword = form.password.trim();
    const rawExternalId = form.external_id.trim();
    const resolvedExternalId = rawExternalId || (editing ? undefined : nextExternalId);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      level: form.level,
      parent_id: form.parent_id,
      external_id: resolvedExternalId,
      active: form.active,
    };
    if (editing) {
      await api.put(`/agents/${editing.id}`, trimmedPassword ? { ...payload, password: trimmedPassword } : payload);
    } else {
      await api.post("/agents", { ...payload, password: trimmedPassword || undefined });
    }
    await fetchData();
    setShowModal(false);
    setForm(INITIAL_FORM);
    setEditing(null);
  };

  const del = async (agent: Agent) => {
    if (!window.confirm(`Delete ${agent.name}? (won't delete if they have a downline)`)) return;
    try {
      await api.delete(`/agents/${agent.id}`);
      await fetchData();
    } catch (error) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      window.alert(message || "Failed to delete");
    }
  };

  const handleSignOut = () => {
    window.location.assign("/login");
  };

  if (loading) {
    return (
      <div className="space-y-8 pb-14">
        <div className="h-64 rounded-3xl bg-slate-100/80 shadow-inner animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-80 rounded-3xl bg-slate-100/80 shadow-inner animate-pulse lg:col-span-1" />
          <div className="h-80 rounded-3xl bg-slate-100/80 shadow-inner animate-pulse lg:col-span-2" />
        </div>
      </div>
    );
  }

  const heroStats = [
    {
      label: "Total agents",
      value: metrics.total.toString(),
      helper: `${metrics.active} active · ${metrics.activityRate}% engagement`,
      icon: Users,
    },
    {
      label: "Leadership bench",
      value: metrics.leaders.toString(),
      helper: `${Math.max(metrics.leaders - (highlight?.directs ?? 0), 0)} beyond spotlight`,
      icon: Shield,
    },
    {
      label: "Downline coverage",
      value: metrics.directReports.toString(),
      helper: "Agents with a reporting line",
      icon: BadgeCheck,
    },
  ] as const;

  return (
    <div className="space-y-8 pb-14">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-rose-500 p-8 text-white shadow-2xl">
        <div className="pointer-events-none absolute inset-0 opacity-45 mix-blend-screen">
          <div className="absolute -left-14 top-10 h-48 w-48 rounded-full bg-white/25 blur-3xl" />
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-fuchsia-400/30 blur-3xl" />
          <div className="absolute -bottom-20 right-10 h-60 w-60 rounded-full bg-indigo-400/30 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-5 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-100 shadow-sm">
              <Sparkles className="h-4 w-4" />
              Agent Success Center
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Agent Management</h1>
              <p className="text-sm leading-relaxed text-indigo-100/90 sm:text-base">
                Curate a thriving sales organization. Activate new producers, nurture leaders, and keep every downline
                mapped in one beautiful workspace.
              </p>
            </div>
            {highlight ? (
              <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm text-indigo-100 shadow-inner sm:text-base">
                <div className="flex flex-wrap items-center gap-2 font-semibold text-white">
                  <CircleUser className="h-4 w-4" />
                  Spotlight: {highlight.agent.name}
                </div>
                <div className="text-xs text-indigo-100/80 sm:text-sm">
                  Leads {highlight.teamSize - 1} teammates · {ROLE_BY_LEVEL[highlight.agent.level]} cohort champion
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm text-indigo-100 shadow-inner sm:text-base">
                Welcome aboard! Add your first agent to illuminate the network.
              </div>
            )}
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

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-indigo-100 bg-white/90 p-6 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Organizational hierarchy</p>
                <h2 className="text-lg font-semibold text-slate-900">See every downline clearly</h2>
                <p className="text-xs text-slate-500">Expand nodes to explore each leader’s span of control.</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-200 hover:bg-white"
              >
                Sign out
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {tree.length ? (
                tree.map((root) => (
                  <TreeNode key={root.id} node={root} depth={0} />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-indigo-200 px-4 py-6 text-center text-sm text-indigo-500">
                  Hierarchy data will appear once agents are onboarded.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leadership spotlight</p>
                <h2 className="text-lg font-semibold text-slate-900">Teams with the widest reach</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {leadershipSpotlight.length} featured
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {leadershipSpotlight.length ? (
                leadershipSpotlight.map(({ agent, teamSize, directs }) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={agent.name} url={agent.avatar_url} size="sm" />
                      <div>
                        <div className="font-semibold text-slate-800">{agent.name}</div>
                        <div className="text-xs text-slate-500">
                          {ROLE_BY_LEVEL[agent.level] ?? `Level ${agent.level}`} · {directs} direct
                          {directs === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {teamSize - 1} total downline
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
                  Once leaders are added, their team stats will appear here.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Talent controls</p>
                <h2 className="text-lg font-semibold text-slate-900">Curate your roster</h2>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Add agent
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)]">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 px-3 py-2 shadow-inner">
                <Filter className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, email, or supervisor"
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {LEVEL_FILTERS.map((filter) => {
                  const isActive = levelFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setLevelFilter(filter.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        isActive
                          ? "border-indigo-300 bg-indigo-50 text-indigo-600 shadow-sm"
                          : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50/70 hover:text-indigo-600"
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <div>
                Viewing{" "}
                <span className="font-semibold text-slate-700">{totalFiltered ? pageStart : 0}</span>-
                <span className="font-semibold text-slate-700">{pageEnd}</span> of{" "}
                <span className="font-semibold text-slate-700">{totalFiltered}</span> agents
                {totalFiltered !== agents.length ? (
                  <>
                    {" "}
                    <span className="text-slate-400">filtered from {agents.length} total</span>
                  </>
                ) : null}
              </div>
              <div>{metrics.inactive} inactive on the bench</div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur">
            <div className="overflow-x-auto rounded-3xl">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Agent</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Reports to</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAgents.length ? (
                    paginatedAgents.map((agent) => {
                      const supervisor =
                        agent.parent_id !== null ? parentMap.get(agent.parent_id)?.name ?? "Unassigned" : "Top-level";
                      return (
                        <tr key={agent.id} className="border-t border-slate-100 bg-white transition hover:bg-indigo-50/40">
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-start gap-3">
                              <Avatar name={agent.name} url={agent.avatar_url} />
                              <div>
                                <div className="font-semibold text-slate-800">{agent.name}</div>
                                <div className="flex items-center gap-1 text-xs text-slate-500">
                                  <CircleUser className="h-3 w-3" />
                                  ID: {agent.external_id || agent.id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 text-slate-400" />
                              {agent.email}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600">{supervisor}</td>
                          <td className="px-4 py-3 align-top">
                            <RoleBadge level={agent.level} />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <StatusPill active={agent.active} />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2 text-slate-500">
                              <button
                                type="button"
                                className="rounded-full border border-transparent p-1 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                                title="Edit agent"
                                onClick={() => openEdit(agent)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-transparent p-1 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                title="Delete agent"
                                onClick={() => del(agent)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                        No agents match your filters. Try broadening the search or clear the role filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <div>
                Page <span className="font-semibold text-slate-700">{currentPage}</span> of{" "}
                <span className="font-semibold text-slate-700">{totalPages}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={isFirstPage}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    isFirstPage
                      ? "cursor-not-allowed border-slate-100 bg-white text-slate-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                  }`}
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={isLastPage}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    isLastPage
                      ? "cursor-not-allowed border-slate-100 bg-white text-slate-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {editing ? "Edit agent" : "Add new agent"}
                </p>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editing ? `Update ${editing.name}` : "Bring a new teammate onboard"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditing(null);
                  setForm(INITIAL_FORM);
                }}
                className="rounded-full bg-white/70 px-3 py-1 text-slate-400 transition hover:text-slate-600"
              >
                Close
              </button>
            </div>

            <form className="grid gap-4 p-6 md:grid-cols-2" onSubmit={save}>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full name</label>
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Enter name"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="name@company.com"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Password {editing ? "(leave blank to keep)" : ""}
                </label>
                <input
                  type="password"
                  value={form.password}
                  required={!editing}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder={editing ? "••••••••" : "Set a password"}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role tier</label>
                <select
                  value={form.level}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, level: parseInt(event.target.value, 10) as AgentForm["level"] }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value={4}>Director</option>
                  <option value={3}>Manager</option>
                  <option value={2}>Team Lead</option>
                  <option value={1}>Agent</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reports to</label>
                <select
                  value={form.parent_id ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      parent_id: event.target.value ? parseInt(event.target.value, 10) : null,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Top-level (no manager)</option>
                  {parentsOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employee / external ID
                </label>
                <input
                  value={form.external_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, external_id: event.target.value }))}
                  placeholder="Optional identifier"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                <input
                  id="agent-active-toggle"
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="agent-active-toggle" className="text-sm text-slate-600">
                  Active agent
                </label>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditing(null);
                    setForm(INITIAL_FORM);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  {editing ? "Save changes" : "Create agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ level }: { level: number }) {
  const label = ROLE_BY_LEVEL[level] ?? `Level ${level}`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
      <Shield className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
        active ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-rose-200 bg-rose-50 text-rose-600"
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function Avatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: "sm" | "md" | "lg" }) {
  const dimension = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const initial = name.trim().charAt(0).toUpperCase() || "A";
  return (
    <div
      className={`${dimension} overflow-hidden rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-inner`}
      aria-hidden="true"
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-semibold">{initial}</div>
      )}
    </div>
  );
}

function TreeNode({ node, depth }: { node: Agent; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = Boolean(node.children?.length);
  const teamSize = countTeamSize(node);
  const directReports = node.children?.length ?? 0;

  return (
    <div style={{ marginLeft: depth * 14 }}>
      <div
        className={`group flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 transition ${
          hasChildren ? "cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/80" : "cursor-default"
        }`}
        onClick={() => {
          if (hasChildren) setOpen((prev) => !prev);
        }}
      >
        {hasChildren ? (
          open ? <ChevronDown className="h-4 w-4 text-indigo-500" /> : <ChevronRight className="h-4 w-4 text-indigo-500" />
        ) : (
          <span className="h-4 w-4" />
        )}
        <Avatar name={node.name} url={node.avatar_url} size="sm" />
        <div className="flex-grow">
          <div className="font-semibold text-slate-700">{node.name}</div>
          <div className="text-xs text-slate-500">
            {ROLE_BY_LEVEL[node.level] ?? node.role} · {directReports} direct{directReports === 1 ? "" : "s"}
          </div>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {teamSize - 1} total
        </span>
      </div>
      {hasChildren && open && (
        <div className="mt-2 space-y-2">
          {node.children?.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function countTeamSize(node: Agent): number {
  return 1 + (node.children?.reduce((sum, child) => sum + countTeamSize(child), 0) ?? 0);
}
