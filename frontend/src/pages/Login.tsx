import { FormEvent, useMemo, useState } from "react";
import api from "../api/client";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("sarah@co.com");
  const [password, setPassword] = useState("pass");
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode === "register" && !name.trim()) {
      setErr("Name is required");
      return;
    }
    try {
      setIsSubmitting(true);
      setErr("");
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login" ? { email, password } : { name, email, password };
      const { data } = await api.post(endpoint, payload);
      localStorage.setItem("token", data.token);
      nav("/");
    } catch (e:any) {
      const defaultMsg = mode === "login" ? "Login failed" : "Registration failed";
      setErr(e?.response?.data?.error || defaultMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const modeCopy = useMemo(
    () =>
      mode === "login"
        ? {
            title: "Welcome back",
            subtitle: "Access your commission insights in seconds.",
            cta: "Sign in",
            switchLabel: "Need an account?",
            switchCta: "Create one",
            footnote: "Use the credentials provided by your administrator.",
          }
        : {
            title: "Create your account",
            subtitle: "Join the commission command center in one step.",
            cta: "Register",
            switchLabel: "Already have access?",
            switchCta: "Sign in instead",
            footnote: "A temporary password will be emailed to the address you use here.",
          },
    [mode],
  );

  const toggleMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setErr("");
    if (nextMode === "register") {
      setName("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_40px_80px_-50px_rgba(15,23,42,0.8)] backdrop-blur-xl">
        <div className="absolute inset-y-0 left-0 hidden w-[480px] bg-gradient-to-br from-indigo-600 via-purple-600 to-sky-500 md:block" />
        <div className="grid gap-0 md:grid-cols-[1fr_minmax(320px,420px)]">
          <div className="relative hidden flex-col justify-between p-12 text-white md:flex">
            <div>
              <div className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-medium">
                Commission Control Hub
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-tight">
                Forecast, track, and celebrate every win.
              </h1>
              <p className="mt-4 max-w-sm text-white/80">
                Stay ahead with real-time dashboards, instant payout insights,
                and automated reconciliation tools built for high-performing revenue teams.
              </p>
            </div>
            <div className="grid gap-4 text-sm text-white/80">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                <p className="font-semibold text-white">Live analytics highlight</p>
                <p className="mt-1">
                  Sarah just closed a 48k ARR deal. Team payout is ready to review.
                </p>
              </div>
              <div className="flex items-center gap-3 text-white/70">
                <div className="h-10 w-10 rounded-full bg-white/20" />
                <div>
                  <p className="font-medium text-white">Finance Automation Suite</p>
                  <p className="text-xs">
                    Designed to keep finance, ops, and sales aligned on every commission cycle.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 bg-white p-8 sm:p-12">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">
                {modeCopy.switchLabel}{" "}
                <button
                  type="button"
                  onClick={() => toggleMode(mode === "login" ? "register" : "login")}
                  className="text-indigo-600 hover:text-indigo-500"
                >
                  {modeCopy.switchCta}
                </button>
              </div>
              <div className="hidden text-xs text-slate-400 sm:inline">
                Secure SSO & MFA ready
              </div>
            </div>

            <div className="mt-10">
              <div className="inline-flex rounded-full bg-slate-100 p-1">
                <button
                  type="button"
                  className={`flex-1 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    mode === "login"
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => toggleMode("login")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    mode === "register"
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => toggleMode("register")}
                >
                  Register
                </button>
              </div>

              <h2 className="mt-8 text-2xl font-semibold text-slate-900">{modeCopy.title}</h2>
              <p className="mt-2 text-sm text-slate-500">{modeCopy.subtitle}</p>
            </div>

            <form className="mt-8 space-y-6" onSubmit={submit}>
              {mode === "register" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600" htmlFor="full-name">
                    Full name
                  </label>
                  <input
                    id="full-name"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Sarah Summers"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600" htmlFor="email">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="sarah@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>

              {err && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {err}
                </div>
              )}

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSubmitting}
              >
                {isSubmitting ? "One moment..." : modeCopy.cta}
              </button>
            </form>

            <p className="mt-6 text-xs text-slate-400">{modeCopy.footnote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
