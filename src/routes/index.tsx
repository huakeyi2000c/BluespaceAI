import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Zap, MessageSquare, Cpu } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-aurora opacity-30 blur-3xl animate-aurora" />
      <div className="pointer-events-none absolute -right-32 top-1/2 h-96 w-96 rounded-full bg-[oklch(0.85_0.18_210/0.4)] blur-3xl animate-aurora" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[oklch(0.75_0.24_350/0.3)] blur-3xl animate-aurora" />

      {/* Nav */}
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-bold tracking-wider">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-aurora shadow-neon-soft">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </span>
          <span className="text-gradient-neon">霓界 NeonMind</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            登录
          </Link>
          <Link
            to="/login"
            className="rounded-lg bg-aurora px-4 py-2 text-sm font-semibold text-primary-foreground shadow-neon-soft transition hover:opacity-90"
          >
            开始对话
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-5xl px-6 pt-16 pb-24 text-center sm:pt-28">
        <div className="glass mx-auto inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--neon-cyan)]" />
          由 Lovable AI 驱动 · Gemini 3 Flash
        </div>

        <h1 className="font-display mt-8 text-5xl font-black leading-tight tracking-tight sm:text-7xl">
          与 <span className="text-gradient-neon">霓虹意识</span>
          <br />
          展开一场对话
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
          沉浸式赛博朋克界面，实时流式回答，多会话历史云端同步。
          让你的每一次提问，都像走进未来都市的深夜霓虹。
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-xl bg-aurora px-7 py-3 text-base font-semibold text-primary-foreground shadow-neon transition hover:scale-105"
          >
            <Zap className="h-4 w-4" />
            立即进入霓界
          </Link>
          <a
            href="#features"
            className="glass inline-flex items-center gap-2 rounded-xl px-7 py-3 text-base font-medium text-foreground transition hover:bg-white/10"
          >
            了解更多
          </a>
        </div>

        {/* Preview card */}
        <div id="features" className="mx-auto mt-20 max-w-3xl">
          <div className="glass glow-ring rounded-2xl p-1">
            <div className="rounded-xl bg-[oklch(0.13_0.04_280/0.7)] p-6 text-left">
              <div className="flex gap-1.5 pb-4">
                <span className="h-3 w-3 rounded-full bg-[var(--neon-pink)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--neon-violet)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--neon-cyan)]" />
              </div>
              <div className="space-y-4 font-sans text-sm">
                <div className="flex justify-end">
                  <div className="rounded-2xl bg-aurora px-4 py-2 text-primary-foreground">
                    用赛博朋克风格描述一下今晚的雨夜
                  </div>
                </div>
                <div className="text-foreground/90">
                  霓虹在湿漉漉的街面上碎成液态光斑，雨水沿着钢筋骨架滑下，
                  全息广告在水面倒映出粉紫色的女主播…
                  <span className="caret-blink" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features grid */}
        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Cpu, title: "实时流式", desc: "字符逐个跳出，沉浸如未来终端。" },
            { icon: MessageSquare, title: "多会话云端", desc: "登录即同步，跨设备无缝接续。" },
            { icon: Sparkles, title: "霓虹美学", desc: "极光渐变 + 玻璃拟态精雕设计。" },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6 text-left transition hover:-translate-y-1">
              <f.icon className="h-6 w-6 text-[var(--neon-cyan)]" />
              <h3 className="mt-4 font-display text-lg font-bold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} 霓界 NeonMind · 由 Lovable 构建
      </footer>
    </div>
  );
}
