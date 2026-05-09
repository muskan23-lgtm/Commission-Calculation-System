import React, { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  BarChart3,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  Sparkles,
  LifeBuoy,
  Bell,
  type LucideIcon,
} from "lucide-react";

type NavLinkConfig = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: { text: string; tone: "info" | "success" | "warn" };
};

const navLinks: NavLinkConfig[] = [
  {
    to: "/agents",
    label: "Agent Management",
    description: "Shape teams & reporting lines",
    icon: Users,
    badge: { text: "Live", tone: "success" },
  },
  {
    to: "/sales",
    label: "Sales Management",
    description: "Capture deals & reserve policies",
    icon: ShoppingBag,
  },
  {
    to: "/reports",
    label: "Commission Reports",
    description: "Visualise payouts & bonuses",
    icon: BarChart3,
  },
  {
    to: "/clawbacks",
    label: "Clawback Management",
    description: "Mitigate revenue erosion fast",
    icon: ShieldCheck,
    badge: { text: "New", tone: "info" },
  },
];

const badgeToneClass = {
  info: "bg-sky-100 text-sky-600 border-sky-200",
  success: "bg-emerald-100 text-emerald-600 border-emerald-200",
  warn: "bg-amber-100 text-amber-600 border-amber-200",
} as const;

const AppNavbar: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const onLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const systemPulse = {
    label: "Today’s coverage",
    value: "18 active deals · 92% attainment",
  };

  if (location.pathname === "/login") return null;

  const NavItems = ({ onSelect }: { onSelect?: () => void }) => (
    <>
      {navLinks.map(({ to, label, description, icon: Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => {
            onSelect?.();
          }}
          className={({ isActive }) =>
            [
              "group relative flex w-full flex-col rounded-2xl border px-3 py-2 text-left transition md:w-auto md:flex-row md:items-center md:gap-2 md:border-transparent md:px-3 md:py-2 md:text-sm",
              isActive
                ? "border-indigo-200 bg-white/95 text-indigo-600 shadow-sm md:bg-white/80"
                : "border-transparent text-indigo-100/70 hover:border-white/20 hover:bg-white/15 hover:text-white md:hover:bg-white/10",
            ].join(" ")
          }
        >
          {({ isActive }) => (
            <>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-indigo-100 md:bg-white/10">
                  <Icon size={16} />
                </span>
                <div className="flex flex-col">
                  <span className="font-medium">{label}</span>
                  <span className="text-xs text-indigo-50/80 md:hidden">{description}</span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs md:mt-0 md:hidden">
                <span className="text-indigo-100/70">{description}</span>
                {badge && (
                  <span
                    className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeToneClass[badge.tone]}`}
                  >
                    {badge.text}
                  </span>
                )}
              </div>
              {badge && (
                <span
                  className={`absolute right-2 top-2 hidden rounded-full border px-2 py-0.5 text-[10px] font-semibold md:inline-flex ${badgeToneClass[badge.tone]}`}
                >
                  {badge.text}
                </span>
              )}
              {isActive && (
                <span
                  className="absolute inset-x-3 bottom-0 hidden h-0.5 translate-y-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-500 md:block"
                  aria-hidden="true"
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </>
  );

  return (
    <header className="sticky top-0 z-50">
      <div className="relative overflow-hidden border-b border-white/20 bg-gradient-to-r from-slate-950/85 via-indigo-900/85 to-purple-900/80 text-white backdrop-blur supports-[backdrop-filter]:bg-slate-950/70">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-0 h-40 w-40 rounded-full bg-indigo-500/40 blur-3xl" />
          <div className="absolute right-8 top-6 h-32 w-32 rounded-full bg-fuchsia-500/35 blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[72px] max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-3 md:justify-start">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="group inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
            >
              <LayoutDashboard size={18} className="transition-transform group-hover:scale-105" />
              Revenue Command
            </button>

            <div className="hidden flex-1 items-center gap-2 md:flex">
              <nav className="flex items-center gap-2">
                <NavItems />
              </nav>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 p-2 text-white shadow-sm transition hover:bg-white/20 md:hidden"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <div className="flex items-center gap-2 text-xs text-indigo-100/80 md:text-sm">
              <Sparkles className="h-4 w-4 text-indigo-100" />
              <span>{systemPulse.label}</span>
              <span className="hidden font-semibold text-white lg:inline">· {systemPulse.value}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="hidden items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 md:inline-flex"
              >
                <Bell size={14} />
                Alerts
              </button>
              <Link
                to="/"
                className="hidden items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 md:inline-flex"
              >
                <LifeBuoy size={14} />
                Support
              </Link>
              <button
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-transparent bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-200"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div className="relative border-t border-white/10 bg-white/5 px-4 pb-4 pt-2 md:hidden">
            <NavItems onSelect={() => setMobileOpen(false)} />
          </div>
        )}
      </div>
    </header>
  );
};

export default AppNavbar;
