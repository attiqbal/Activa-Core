// Thin client for the Virtual Nafree API. Every call fails soft: when the API is not running,
// the pages keep working as a demo.
const TOKEN_KEY = "vn.token";
export const getToken = (): string | null => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string): void => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } };

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data?: T }> {
  try {
    const token = getToken();
    const res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : undefined;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0 };
  }
}

export interface Org {
  name: string;
  trialEndsAt?: string;
  dailyQuotaPerEmployee: number;
  team: { id: string; templateKey: string; name: string; energyLeft: number }[];
}
