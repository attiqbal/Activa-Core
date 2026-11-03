import "./styles.css";
import { api, setToken } from "./api";

// The emailed link carries the one-time token in the part after "#", which is never sent to any server
// except by this page, when it posts it to the API.
const token = new URLSearchParams(location.hash.slice(1)).get("token");
history.replaceState(null, "", location.pathname);
const $ = (id: string) => document.getElementById(id)!;

(async () => {
  const r = token ? await api<{ token: string; email: string; hasOrganisation: boolean }>("/signin/verify", { body: { token } }) : undefined;
  if (!r?.ok || !r.data) {
    $("h").textContent = "This link didn't work";
    $("p").textContent = (r?.data as { error?: string } | undefined)?.error ?? "It may have expired or been used already. Request a new one.";
    $("back").removeAttribute("hidden");
    return;
  }
  setToken(r.data.token);
  try {
    const profile = JSON.parse(localStorage.getItem("vn.profile") ?? "{}");
    localStorage.setItem("vn.profile", JSON.stringify({ ...profile, email: r.data.email }));
  } catch { /* storage unavailable */ }
  location.replace(r.data.hasOrganisation ? "/app.html" : "/onboarding.html");
})();
