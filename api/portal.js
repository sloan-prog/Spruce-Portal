export default async function handler(req, res) {
  const t = (req.query.t || "").toString();
  const path = (req.query.path || "portal").toString();

  res.setHeader("Cache-Control", "no-store");

  if (!t) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  const UPSTREAM = process.env.UPSTREAM;

if (!UPSTREAM) {
  res.status(500).json({ error: "Missing UPSTREAM env var" });
  return;
}

  const upstreamUrl = new URL(UPSTREAM);
  upstreamUrl.searchParams.set("path", path);
  upstreamUrl.searchParams.set("t", t);

  try {
    const resp = await fetch(upstreamUrl.toString());
    const text = await resp.text();

    let data;
    try {
      data = JSON.parse(text);
      if (typeof data === "string") data = JSON.parse(data);
    } catch {
      res.status(502).json({
        error: "Upstream did not return JSON",
        sample: text.slice(0, 200),
      });
      return;
    }

    res.status(resp.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Proxy error", detail: String(err) });
  }
}
