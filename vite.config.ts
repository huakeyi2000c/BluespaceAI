import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // 开发模式 CORS 代理中间件
    mode === "development" && {
      name: "vite-proxy-ai",
      configureServer(server) {
        server.middlewares.use("/api/public/ai-proxy", async (req, res) => {
          const CORS = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400",
          };
          if (req.method === "OPTIONS") {
            res.writeHead(204, CORS);
            res.end();
            return;
          }
          if (req.method !== "POST") {
            res.writeHead(405, { "Content-Type": "application/json", ...CORS });
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          let body = "";
          for await (const chunk of req) body += chunk;
          let payload: { url?: string; method?: string; headers?: Record<string, string>; body?: string };
          try {
            payload = JSON.parse(body);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json", ...CORS });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }
          const { url, method = "GET", headers = {}, body: reqBody } = payload;
          if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
            res.writeHead(400, { "Content-Type": "application/json", ...CORS });
            res.end(JSON.stringify({ error: "Invalid url" }));
            return;
          }
          try {
            const upstream = await fetch(url, {
              method,
              headers,
              body: method === "GET" || method === "HEAD" ? undefined : reqBody,
            });
            const respHeaders: Record<string, string> = { ...CORS };
            const ct = upstream.headers.get("content-type");
            if (ct) respHeaders["Content-Type"] = ct;
            const buf = Buffer.from(await upstream.arrayBuffer());
            res.writeHead(upstream.status, respHeaders);
            res.end(buf);
          } catch (e: any) {
            res.writeHead(502, { "Content-Type": "application/json", ...CORS });
            res.end(JSON.stringify({ error: `Proxy fetch failed: ${e?.message || e}` }));
          }
        });
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
