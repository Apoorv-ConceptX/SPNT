// Demo sign-in for Guardian on Vercel.
// Accounts come from environment variables (Project Settings > Environment Variables); defaults shown below.
const crypto = require("crypto");

function accounts() {
  const env = process.env;
  return {
    [(env.INSPECTOR_USER || "inspector").toLowerCase()]: {
      password: env.INSPECTOR_PASSWORD || "guardian", role: "inspector", name: env.INSPECTOR_NAME || "Site inspector",
    },
    [(env.MANAGER_USER || "manager").toLowerCase()]: {
      password: env.MANAGER_PASSWORD || "guardian", role: "manager", name: env.MANAGER_NAME || "Operations manager",
    },
  };
}

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ detail: "Use POST" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const user = String(body.user || "").trim().toLowerCase();
  const acct = accounts()[user];
  if (!acct || !same(body.password || "", acct.password)) {
    return res.status(401).json({ detail: "That username and password don't match" });
  }
  if (body.role && body.role !== acct.role) {
    return res.status(403).json({ detail: `${user} signs in as ${acct.role}, not ${body.role}` });
  }
  return res.status(200).json({ token: crypto.randomBytes(18).toString("base64url"), user, role: acct.role, name: acct.name });
};
