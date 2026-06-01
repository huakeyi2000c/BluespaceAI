import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, api-key",
  "Access-Control-Max-Age": "86400",
};

// 通用 AI 网关代理：前端直连遇到 CORS 时由后端转发
// 入参 JSON: { url, method?, headers?, body? }
export const Route = createFileRoute("/api/public/ai-proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: { url?: string; method?: string; headers?: Record<string, string>; body?: string };
        try {
          payload = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const { url, method = "GET", headers = {}, body } = payload;
        if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
          return new Response(JSON.stringify({ error: "Invalid url" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        try {
          const upstream = await fetch(url, {
            method,
            headers,
            body: method === "GET" || method === "HEAD" ? undefined : body,
          });
          const respHeaders = new Headers();
          const ct = upstream.headers.get("content-type");
          if (ct) respHeaders.set("Content-Type", ct);
          for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);
          return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: `Proxy fetch failed: ${e?.message || e}` }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
