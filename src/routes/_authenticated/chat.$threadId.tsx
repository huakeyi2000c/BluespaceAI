import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { getConversation, streamChat } from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ChatThread,
});

type Msg = { id: string; role: "user" | "assistant" | "system"; content: string };

function ChatThread() {
  const { threadId } = Route.useParams();
  const get = useServerFn(getConversation);
  const stream = useServerFn(streamChat);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["conversation", threadId],
    queryFn: () => get({ data: { id: threadId } }),
  });

  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const allMessages: Msg[] = [...(data?.messages ?? []), ...pending] as Msg[];

  useEffect(() => {
    setPending([]);
    setStreamText("");
    setStreaming(false);
  }, [threadId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId, streaming]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [allMessages.length, streamText]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg: Msg = { id: `tmp-u-${Date.now()}`, role: "user", content: text };
    setPending((p) => [...p, userMsg]);
    setStreaming(true);
    setStreamText("");
    let assembled = "";
    try {
      const iter = await stream({ data: { conversationId: threadId, prompt: text } });
      for await (const chunk of iter as AsyncIterable<{ delta: string }>) {
        assembled += chunk.delta;
        setStreamText(assembled);
      }
      // Move into pending with assistant role
      setPending((p) => [
        ...p,
        { id: `tmp-a-${Date.now()}`, role: "assistant", content: assembled },
      ]);
      setStreamText("");
      // Refresh conversation + sidebar list
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["conversation", threadId] }),
        qc.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
      setPending([]);
    } catch (e) {
      toast.error((e as Error).message || "请求失败");
      setStreaming(false);
      return;
    }
    setStreaming(false);
  }, [input, streaming, stream, threadId, qc]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/60 px-6 py-4 backdrop-blur-xl">
        <div className="font-display text-sm tracking-wider text-muted-foreground">
          {data?.conversation?.title ?? "加载中…"}
        </div>
        <div className="text-xs text-muted-foreground">Gemini 3 Flash · Lovable AI</div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="neo-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && allMessages.length === 0 && !streaming && (
            <div className="py-16 text-center">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-aurora opacity-90 shadow-neon animate-float" />
              <h2 className="font-display mt-6 text-2xl font-bold text-gradient-neon">
                开始一场霓虹对话
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                试试问点什么，例如：
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {["写一首赛博朋克的中文短诗", "用三句话解释相对论", "帮我策划周末旅行"].map(
                  (s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="glass rounded-full px-4 py-1.5 text-xs text-foreground transition hover:bg-white/10"
                    >
                      {s}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          <div className="space-y-6">
            {allMessages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {streaming && (
              <MessageBubble role="assistant" content={streamText} streaming />
            )}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-[oklch(0.13_0.04_280/0.6)] px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="glass glow-ring flex items-end gap-2 rounded-2xl p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="向霓界提问…（Enter 发送，Shift+Enter 换行）"
              rows={1}
              className="neo-scroll flex-1 resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              style={{ minHeight: 40, maxHeight: 200 }}
              disabled={streaming}
            />
            <button
              onClick={send}
              disabled={streaming || !input.trim()}
              aria-label="发送"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aurora text-primary-foreground shadow-neon-soft transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            AI 可能出错，请审慎参考
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
}) {
  if (role === "system") return null;
  const isUser = role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isUser ? "bg-secondary text-foreground" : "bg-aurora text-primary-foreground shadow-neon-soft"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? "bg-aurora text-primary-foreground shadow-neon-soft"
            : "glass text-foreground"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">
          {content}
          {streaming && <span className="caret-blink" />}
        </div>
      </div>
    </div>
  );
}
