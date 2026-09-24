#!/usr/bin/env node
// Local CORS proxy for the live bench.
//   node bench/proxy.mjs
// Then open bench/index.html (or serve it) and leave endpoint at /v1/systemone.
// The API key stays in the browser. This process only forwards Authorization.

import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = "https://api.typesafe.ai/v1/systemone";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.url !== "/v1/systemone" || req.method !== "POST") {
      res.writeHead(404, { ...cors, "Content-Type": "text/plain" });
      return res.end("not found");
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          Authorization: req.headers.authorization || "",
          "Content-Type": "application/json",
        },
        body: Buffer.concat(chunks),
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { ...cors, "Content-Type": "application/json" });
      res.end(text);
    } catch (err) {
      res.writeHead(502, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: { error_type: "proxy_error", message: String(err) } }));
    }
  })
  .listen(PORT, () => {
    console.log(`JEV bench proxy  http://127.0.0.1:${PORT}/v1/systemone`);
  });
