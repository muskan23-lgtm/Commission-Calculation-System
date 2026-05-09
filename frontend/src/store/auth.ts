export type AuthProfile = {
  id: number;
  name?: string;
  email?: string;
  level?: number;
};

function decodeBase64Url(input: string): string {
  let normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) {
    normalized += "=";
  }
  const atobFn =
    typeof globalThis !== "undefined" && typeof (globalThis as any).atob === "function"
      ? ((globalThis as any).atob as typeof atob)
      : undefined;
  if (atobFn) return atobFn(normalized);
  throw new Error("No base64 decoder available");
}

export const Auth = {
  save(token: string) { localStorage.setItem("token", token); },
  clear() { localStorage.removeItem("token"); },
  isAuthed(): boolean { return !!localStorage.getItem("token"); },
  profile(): AuthProfile | null {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const [, payload] = token.split(".");
    if (!payload) return null;
    try {
      const decoded = JSON.parse(decodeBase64Url(payload));
      const id = parseInt(decoded.sub, 10);
      if (Number.isNaN(id)) return null;
      const levelValue = decoded.level;
      let level: number | undefined;
      if (typeof levelValue === "number") {
        if (!Number.isNaN(levelValue)) level = levelValue;
      } else if (typeof levelValue === "string") {
        const parsedLevel = parseInt(levelValue, 10);
        if (!Number.isNaN(parsedLevel)) level = parsedLevel;
      }
      return {
        id,
        name: typeof decoded.name === "string" ? decoded.name : undefined,
        email: typeof decoded.email === "string" ? decoded.email : undefined,
        level,
      };
    } catch {
      return null;
    }
  },
};
