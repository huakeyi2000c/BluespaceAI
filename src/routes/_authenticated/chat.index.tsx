import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createConversation } from "@/lib/chat.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: EmptyChat,
});

function EmptyChat() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createConversation);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      const c = await create({ data: {} });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/chat/$threadId", params: { threadId: c.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[var(--gradient-glow)]" />
      <div className="relative">
        <div className="mx-auto h-20 w-20 rounded-3xl bg-aurora opacity-90 shadow-neon animate-float" />
        <h1 className="font-display mt-8 text-4xl font-black">
          <span className="text-gradient-neon">欢迎来到霓界</span>
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          创建一个新的对话，与霓虹意识开始交流。它可以创作、编程、解释、灵感激发。
        </p>
        <button
          onClick={start}
          disabled={loading}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-aurora px-6 py-3 text-sm font-semibold text-primary-foreground shadow-neon transition hover:scale-105 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          新建对话
        </button>
      </div>
    </div>
  );
}
