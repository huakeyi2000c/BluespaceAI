import { createFileRoute, Link, Outlet, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, MessageSquare, Trash2, LogOut, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listConversations,
  createConversation,
  deleteConversation,
} from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatLayout,
});

function ChatLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { threadId?: string };

  const list = useServerFn(listConversations);
  const create = useServerFn(createConversation);
  const remove = useServerFn(deleteConversation);

  const { data: convs = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => list(),
  });

  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  // If no thread selected and we have conversations, navigate to first; otherwise create new
  useEffect(() => {
    if (isLoading) return;
    if (params.threadId) return;
    if (convs.length > 0) {
      navigate({ to: "/chat/$threadId", params: { threadId: convs[0].id }, replace: true });
    }
  }, [isLoading, params.threadId, convs, navigate]);

  const newChat = async () => {
    setCreating(true);
    try {
      const c = await create({ data: {} });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/chat/$threadId", params: { threadId: c.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const del = async (id: string) => {
    try {
      await remove({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      if (params.threadId === id) {
        navigate({ to: "/chat", replace: true });
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/" });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-72 flex-col border-r border-border/60 bg-[oklch(0.13_0.04_280/0.7)] backdrop-blur-xl md:flex">
        <Link to="/" className="flex items-center gap-2 px-5 pt-5 pb-3 font-display text-base font-bold">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-aurora shadow-neon-soft">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
          <span className="text-gradient-neon">霓界 NeonMind</span>
        </Link>

        <div className="px-3 pt-2">
          <button
            onClick={newChat}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-aurora px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-neon-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            新建对话
          </button>
        </div>

        <div className="neo-scroll mt-4 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {!isLoading && convs.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              暂无对话，点击上方新建一个吧
            </p>
          )}
          {convs.map((c) => {
            const active = params.threadId === c.id;
            return (
              <div
                key={c.id}
                className={`group relative flex items-center rounded-lg ${
                  active
                    ? "bg-primary/15 text-foreground glow-ring"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: c.id }}
                  className="flex flex-1 items-center gap-2 truncate px-3 py-2 text-sm"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{c.title}</span>
                </Link>
                <button
                  onClick={() => del(c.id)}
                  aria-label="删除"
                  className="mr-1 rounded p-1.5 opacity-0 transition group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border/60 p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs">
            <div className="truncate">
              <div className="truncate text-foreground">{email || "已登录"}</div>
            </div>
            <button
              onClick={signOut}
              aria-label="退出登录"
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
