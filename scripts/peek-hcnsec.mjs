import fs from "fs";
const t = fs.readFileSync(".vercel/.env.hcn", "utf8");
for (const name of ["HCNSEC_API_KEY", "HCNSEC_BASE_URL", "HCNSEC_MODEL"]) {
  const m = t.match(new RegExp("^" + name + "=(.*)$", "m"));
  if (!m) {
    console.log(name, "(missing)");
    continue;
  }
  let v = m[1].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  v = v.replace(/\\r/g, "\r").replace(/\\n/g, "\n");
  const cleaned = v.replace(/[\r\n\t ]+/g, "");
  if (name.includes("KEY")) {
    console.log(
      name,
      "rawLen=" + v.length,
      "cleanLen=" + cleaned.length,
      "prefix=" + JSON.stringify(cleaned.slice(0, 8)),
      "hasCRLF=" + /[\r\n]/.test(v),
    );
  } else {
    console.log(name, JSON.stringify(cleaned));
  }
}
