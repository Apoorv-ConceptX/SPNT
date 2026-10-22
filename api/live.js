// Live inspector -> manager sync for Guardian on Vercel.
// The inspector's app POSTs its playback position about once a second; the manager's app GETs it.
//
// Needs a Redis database connected to the Vercel project (Storage tab). Works with whatever variable names the
// integration created:
//   * Upstash REST:  KV_REST_API_URL + KV_REST_API_TOKEN, UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN,
//                    or any custom prefix, e.g. STORAGE_KV_REST_API_URL + STORAGE_KV_REST_API_TOKEN
//   * Any Redis URL: REDIS_URL, KV_URL, or any *_REDIS_URL / *_KV_URL (redis:// or rediss://), e.g. Redis Cloud
// Without one this returns 501 and the app falls back to syncing windows of the same browser.
//
// Check the set-up by opening /api/live?check=1 on the site: it lists the Redis-related variable NAMES this
// deployment can see (never their values) and tests the connection.
const net = require("net");
const tls = require("tls");

const ENV = process.env;
const NAMES = Object.keys(ENV).filter(k => /REDIS|KV_|UPSTASH/i.test(k)).sort();

function restConfig() {
  const pairs = [["KV_REST_API_URL", "KV_REST_API_TOKEN"], ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]];
  for (const k of NAMES) {
    let m;
    if ((m = k.match(/^(.*)REST_API_URL$/))) pairs.push([k, m[1] + "REST_API_TOKEN"]);
    if ((m = k.match(/^(.*)REST_URL$/))) pairs.push([k, m[1] + "REST_TOKEN"]);
  }
  for (const [u, t] of pairs) if (/^https?:\/\//.test(ENV[u] || "") && ENV[t]) return { url: ENV[u], token: ENV[t], via: `${u} + ${t}` };
  return null;
}

function tcpConfig() {
  const order = ["REDIS_URL", "KV_URL", ...NAMES.filter(k => /(REDIS|KV)_URL$/.test(k))];
  for (const k of order) {
    const v = ENV[k] || "";
    if (/^rediss?:\/\//.test(v)) return { url: v, via: k };
  }
  return null;
}

const REST = restConfig();
const TCP = REST ? null : tcpConfig();

async function restCmd(cmd) {
  const r = await fetch(REST.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Redis REST HTTP ${r.status}`);
  return j.result;
}

// Minimal Redis client (RESP over TCP/TLS): one short connection per call, which suits serverless functions.
function encode(args) {
  return `*${args.length}\r\n` + args.map(a => { const s = String(a); return `$${Buffer.byteLength(s)}\r\n${s}\r\n`; }).join("");
}
function parse(buf, i) {   // -> [value, nextIndex] or null if incomplete
  const end = buf.indexOf("\r\n", i);
  if (end < 0) return null;
  const type = String.fromCharCode(buf[i]), line = buf.toString("utf8", i + 1, end);
  if (type === "+") return [line, end + 2];
  if (type === "-") return [new Error(line), end + 2];
  if (type === ":") return [Number(line), end + 2];
  if (type === "$") {
    const n = Number(line);
    if (n < 0) return [null, end + 2];
    if (buf.length < end + 2 + n + 2) return null;
    return [buf.toString("utf8", end + 2, end + 2 + n), end + 2 + n + 2];
  }
  if (type === "*") {
    const n = Number(line); if (n < 0) return [null, end + 2];
    const out = []; let j = end + 2;
    for (let k = 0; k < n; k++) { const r = parse(buf, j); if (!r) return null; out.push(r[0]); j = r[1]; }
    return [out, j];
  }
  return [new Error("Unexpected Redis reply"), buf.length];
}
function tcpCmd(cmd) {
  const u = new URL(TCP.url);
  const pre = [];
  const user = decodeURIComponent(u.username || ""), pass = decodeURIComponent(u.password || "");
  if (pass) pre.push(user && user !== "default" ? ["AUTH", user, pass] : ["AUTH", pass]);
  const db = Number((u.pathname || "").slice(1));
  if (db) pre.push(["SELECT", db]);
  const all = [...pre, cmd];
  return new Promise((resolve, reject) => {
    const opts = { host: u.hostname, port: Number(u.port) || 6379 };
    const sock = u.protocol === "rediss:" ? tls.connect({ ...opts, servername: u.hostname }) : net.connect(opts);
    let buf = Buffer.alloc(0), done = false;
    const finish = (err, val) => { if (done) return; done = true; sock.destroy(); err ? reject(err) : resolve(val); };
    sock.setTimeout(5000, () => finish(new Error("Redis connection timed out")));
    sock.on("error", e => finish(e));
    sock.on(u.protocol === "rediss:" ? "secureConnect" : "connect", () => sock.write(all.map(encode).join("")));
    sock.on("data", d => {
      buf = Buffer.concat([buf, d]);
      const replies = []; let i = 0, r;
      while (i < buf.length && (r = parse(buf, i))) { replies.push(r[0]); i = r[1]; }
      if (replies.length < all.length) return;
      const err = replies.find(x => x instanceof Error);
      finish(err ? new Error("Redis: " + err.message) : null, replies[replies.length - 1]);
    });
  });
}

const redis = cmd => (REST ? restCmd(cmd) : tcpCmd(cmd));

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  if (q.check !== undefined) {
    const info = {
      configured: !!(REST || TCP), via: REST ? "REST: " + REST.via : TCP ? "Redis URL: " + TCP.via : null,
      deployment: ENV.VERCEL_ENV || "unknown", redis_variables_seen: NAMES,
    };
    if (REST || TCP) {
      try { info.ping = await redis(["PING"]); info.ok = true; }
      catch (e) { info.ok = false; info.error = String(e.message || e); }
    } else {
      info.ok = false;
      info.hint = NAMES.length
        ? "Redis variables exist but none is a REST URL+token pair or a redis:// URL; send this list to fix the names."
        : "This deployment sees no Redis variables. Connect the database to this project for the Production environment, then redeploy, and open the production domain (not an older deployment link).";
    }
    return res.status(200).json(info);
  }
  if (!REST && !TCP) {
    return res.status(501).json({ error: "Live sync is not configured (no Redis store connected)", redis_variables_seen: NAMES, deployment: ENV.VERCEL_ENV || "unknown" });
  }
  let body = {};
  if (req.method === "POST") { try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}; } catch (e) { body = {}; } }
  const job = String(q.job || body.job || "").slice(0, 64);
  if (!/^[\w.\-]+$/.test(job)) return res.status(400).json({ error: "job is required" });
  const key = `guardian:live:${job}`;
  try {
    if (req.method === "POST") {
      const live = {
        t: Number(body.t) || 0, playing: !!body.playing, rate: Number(body.rate) || 1, duration: Number(body.duration) || 0,
        inspector: String(body.inspector || "Inspector").slice(0, 60), seen: Date.now() / 1000,
      };
      await redis(["SET", key, JSON.stringify(live), "EX", "3600"]);
      return res.status(200).json({ ok: true });
    }
    const raw = await redis(["GET", key]);
    const live = raw ? JSON.parse(raw) : null;
    if (live) live.age_s = Math.max(0, Math.round((Date.now() / 1000 - live.seen) * 10) / 10);
    return res.status(200).json({ job, live, now: Date.now() / 1000 });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
};
