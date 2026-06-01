import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/chat" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/chat" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/chat" },
        });
        if (error) throw error;
        toast.success("注册成功！正在登录…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("欢迎回到霓界 ✨");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/chat",
    });
    if (result.error) {
      toast.error(result.error.message);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 bg-[var(--gradient-glow)]" />

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-display text-lg font-bold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-aurora shadow-neon-soft">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </span>
          <span className="text-gradient-neon">霓界 NeonMind</span>
        </Link>

        <div className="glass glow-ring rounded-2xl p-8">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {mode === "signin" ? "欢迎回来" : "加入霓界"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "登录账号开始对话" : "创建账号，开启 AI 之旅"}
          </p>

          <button
            onClick={google}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.4-1.66 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.85s2.59-5.85 5.76-5.85c1.8 0 3.01.77 3.7 1.43l2.52-2.43C16.79 3.79 14.74 2.9 12.18 2.9 6.95 2.9 2.7 7.15 2.7 12.27s4.25 9.37 9.48 9.37c5.47 0 9.1-3.84 9.1-9.25 0-.62-.07-1.09-.18-1.55Z" /></svg>
            使用 Google 继续
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            或使用邮箱
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-aurora px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-neon-soft transition hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "登录" : "注册"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "还没有账号？" : "已有账号？"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-[var(--neon-cyan)] hover:underline"
            >
              {mode === "signin" ? "立即注册" : "去登录"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
