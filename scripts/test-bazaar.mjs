import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = {
  ...parseEnv(fs.readFileSync(path.join(root, ".env"), "utf8")),
  ...parseEnv(
    fs.existsSync(path.join(root, ".env.local"))
      ? fs.readFileSync(path.join(root, ".env.local"), "utf8")
      : "",
  ),
};

const key = env.BAZAARLINK_API_KEY;
console.log("bazaar key len:", key ? key.length : 0);

const res = await fetch("https://bazaarlink.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://agfusion.vercel.app",
    "X-Title": "AGFusion",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    messages: [{ role: "user", content: "Reply with exactly OK" }],
  }),
});
const t = await res.text();
console.log("status", res.status, t.slice(0, 400));
