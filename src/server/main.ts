import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createPlatform } from "./platform.js";

const env = process.env;
const production = env.NODE_ENV === "production";
if (production && !env.SESSION_SECRET) throw new Error("SESSION_SECRET is required in production");
if (production && env.ALLOW_DEV_AUTH === "1") throw new Error("ALLOW_DEV_AUTH must not be on in production");

const platform = createPlatform({
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  anthropicModel: env.ANTHROPIC_MODEL,
  sessionSecret: env.SESSION_SECRET ?? randomBytes(32).toString("hex"),
  allowDevAuth: env.ALLOW_DEV_AUTH === "1",
  slack:
    env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_SIGNING_SECRET && env.SLACK_REDIRECT_URI
      ? { clientId: env.SLACK_CLIENT_ID, clientSecret: env.SLACK_CLIENT_SECRET, signingSecret: env.SLACK_SIGNING_SECRET, redirectUri: env.SLACK_REDIRECT_URI }
      : undefined,
});
const handle = createApp(platform);

createServer(async (incoming, out) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of incoming) {
    size += (c as Buffer).length;
    if (size > 1_000_000) { out.writeHead(413).end(); return; }
    chunks.push(c as Buffer);
  }
  const url = new URL(incoming.url ?? "/", "http://localhost");
  const res = await handle({
    method: incoming.method ?? "GET",
    path: url.pathname,
    query: url.searchParams,
    headers: Object.fromEntries(Object.entries(incoming.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
    rawBody: Buffer.concat(chunks).toString("utf8"),
  });
  out.writeHead(res.status, { "content-type": "application/json", ...res.headers });
  out.end(res.body === undefined ? undefined : JSON.stringify(res.body));
  if (res.after) res.after().catch(() => undefined);
}).listen(Number(env.PORT ?? 8787), () => console.log(`API on :${env.PORT ?? 8787}`));
