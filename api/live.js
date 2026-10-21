// Live inspector -> manager sync for Guardian on Vercel.
// The inspector's app POSTs its playback position about once a second; the manager's app GETs it.
// Needs a Redis store: add "Upstash for Redis" from the Vercel Marketplace (Storage tab) and connect it to the
// project. Either KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN works.
// Without it this returns 501 and the app falls back to syncing windows of the same browser.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Redis HTTP ${r.status}`);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(501).json({ error: "Live sync is not configured (no Redis store connected)" });
  const body = req.method === "POST" ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) : {};
  const job = String((req.query && req.query.job) || body.job || "").slice(0, 64);
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
