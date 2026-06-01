import { useEffect, useMemo, useRef, useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Bot, User, Loader2, Sparkles, Trash2, Square, Copy, ClipboardPaste, TextSelect, Eraser, Paperclip, Image as ImageIcon, X, FileText, Mic, MicOff, Wand2, Check, Link2, Share2, ImageOff, History, Plus, MessageSquare, Pencil, Pin, PinOff, Download, Upload, Play, Search, PlayCircle, PauseCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AISettings, ChatMessage, fetchModels, getAllModels, isMediaModel, saveSettings, streamChat, validateModel, uuid, StreamResult } from "@/lib/aiClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ModelPicker from "./ModelPicker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props { settings: AISettings; onSettingsChange?: (s: AISettings) => void }

const SUGGESTIONS = [
  "用三句话解释量子纠缠",
  "帮我写一份产品发布检查清单",
  "推荐 5 本 2026 年值得读的科幻小说",
  "用 Python 写一个快速排序算法",
];

// 支持的图片扩展名（含现代格式）
const IMG_EXT = "png|jpe?g|gif|webp|bmp|svg|avif|apng|ico|tiff?|heic|heif|jxl";

// 把 AI 输出里的纯图片 URL / base64 自动转成 markdown 图片语法，让 ReactMarkdown 渲染
function autoLinkImages(text: string): string {
  if (!text) return text;
  let s = text;
  // data:image/...;base64,xxxx （仅当不在 ()/markdown 图片中时）
  s = s.replace(/(^|[^(\]])\b(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g, (_m, p, url) => `${p}![image](${url})`);
  // http(s) 直链图片
  s = s.replace(
    new RegExp(`(^|[^(\\]])\\b(https?:\\/\\/[^\\s<>"')]+\\.(?:${IMG_EXT})(?:\\?[^\\s<>"')]*)?)`, "gi"),
    (_m, p, url) => `${p}![image](${url})`
  );
  // 流式输出过程中：自动闭合尚未结束的 markdown 图片语法 ![alt](url …
  // 触发条件：URL 已是完整图片直链（含扩展名或 data:image base64），且后接换行或字符串末尾
  s = s.replace(
    new RegExp(`!\\[([^\\]]*)\\]\\((https?:\\/\\/[^\\s<>"')]+\\.(?:${IMG_EXT})(?:\\?[^\\s<>"')]*)?)(?=\\s|$)`, "gi"),
    (_m, alt, url) => `![${alt}](${url})`
  );
  s = s.replace(
    /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{64,})(?=\s|$)/g,
    (_m, alt, url) => `![${alt}](${url})`
  );
  return s;
}

// 智能图片：加载占位、错误降级、复制/分享链接
const SmartImage = memo(function SmartImage(props: any) {
  const { src, alt } = props;
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!src) return;
    try { await navigator.clipboard.writeText(src); toast.success("链接已复制"); }
    catch { toast.error("复制失败"); }
  };
  const share = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!src) return;
    const nav: any = navigator;
    if (nav.share) {
      try { await nav.share({ title: alt || "图片", url: src }); return; }
      catch { /* user cancelled */ }
    }
    try { await navigator.clipboard.writeText(src); toast.success("链接已复制，可粘贴分享"); }
    catch { toast.error("分享失败"); }
  };

  return (
    <span className="relative inline-block my-2 max-w-full group/img align-top">
      {status === "loading" && (
        <span className="flex items-center justify-center w-[280px] h-[200px] rounded-xl bg-gradient-to-br from-card/60 to-muted/40 animate-pulse">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </span>
      )}
      {status === "error" ? (
        <span className="flex flex-col items-center justify-center gap-2 w-[280px] h-[160px] rounded-xl bg-destructive/5 text-xs text-muted-foreground">
          <ImageOff className="h-5 w-5 text-destructive" />
          <span>图片加载失败</span>
          {src && <a href={src} target="_blank" rel="noreferrer" className="text-primary underline truncate max-w-[240px]">在新窗口打开</a>}
        </span>
      ) : (
        <img
          {...props}
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          onClick={() => src && window.open(src, "_blank")}
          className={cn(
            "max-h-[480px] w-auto max-w-full rounded-xl shadow-elegant cursor-zoom-in animate-image-reveal",
            status === "loading" && "absolute inset-0 opacity-0 pointer-events-none"
          )}
        />
      )}
      {status === "loaded" && (
        <span className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
          <button
            onClick={copyLink}
            title="复制链接"
            className="rounded-md p-1.5 bg-background/70 backdrop-blur hover:bg-background text-muted-foreground hover:text-primary"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={share}
            title="分享"
            className="rounded-md p-1.5 bg-background/70 backdrop-blur hover:bg-background text-muted-foreground hover:text-primary"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </span>
  );
});

const ChatPanel = ({ settings, onSettingsChange }: Props) => {
  const CHAT_KEY = "ai_chat_history_v1"; // legacy single-session key (for migration)
  const SESSIONS_KEY = "ai_chat_sessions_v1";
  const CURRENT_KEY = "ai_chat_current_v1";
  const INPUT_KEY = "ai_chat_input_v1";

  type UIMessage = ChatMessage & { paused?: boolean; error?: string; finishReason?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  type Session = { id: string; title: string; messages: UIMessage[]; updatedAt: number; pinned?: boolean };

  const newSession = (): Session => ({
    id: uuid(),
    title: "新对话",
    messages: [],
    updatedAt: Date.now(),
  });

  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) return arr;
      }
      // migrate legacy
      const legacy = localStorage.getItem(CHAT_KEY);
      if (legacy) {
        const msgs = JSON.parse(legacy);
        if (Array.isArray(msgs) && msgs.length) {
          const first = msgs.find((m: ChatMessage) => m.role === "user");
          return [{
            id: uuid(),
            title: first?.content?.slice(0, 30) || "历史对话",
            messages: msgs,
            updatedAt: Date.now(),
          }];
        }
      }
    } catch {}
    return [newSession()];
  });
  const [currentId, setCurrentId] = useState<string>(() => {
    try {
      const id = localStorage.getItem(CURRENT_KEY);
      if (id) return id;
    } catch {}
    return "";
  });

  const current = useMemo(
    () => sessions.find((s) => s.id === currentId) ?? sessions[0],
    [sessions, currentId]
  );

  useEffect(() => {
    if (!current) return;
    if (currentId !== current.id) setCurrentId(current.id);
  }, [current, currentId]);

  const messages = (current?.messages ?? []) as UIMessage[];
  const setMessages = (updater: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== (current?.id ?? "")) return s;
      const next = typeof updater === "function" ? (updater as any)(s.messages) : updater;
      // 自动用第一条用户消息作为标题
      let title = s.title;
      if ((title === "新对话" || !title) && Array.isArray(next)) {
        const firstUser = next.find((m) => m.role === "user");
        if (firstUser?.content) title = firstUser.content.slice(0, 30);
      }
      return { ...s, messages: next, title, updatedAt: Date.now() };
    }));
  };

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [runHtml, setRunHtml] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState<string>(() => {
    try { return localStorage.getItem(INPUT_KEY) ?? ""; } catch { return ""; }
  });
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  type Attachment = { id: string; name: string; kind: "image" | "text"; size: number; dataUrl?: string; text?: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>("");
  const [draft, setDraft] = useState<string>("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // 持久化所有会话
  useEffect(() => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch {}
  }, [sessions]);
  useEffect(() => {
    try { if (currentId) localStorage.setItem(CURRENT_KEY, currentId); } catch {}
  }, [currentId]);

  // 持久化草稿输入
  useEffect(() => {
    try { localStorage.setItem(INPUT_KEY, input); } catch {}
  }, [input]);

  // 把 UIMessage 清理为 API 可用的纯净 ChatMessage（去掉 paused/error 等额外字段）
  const sanitize = (msgs: UIMessage[]): ChatMessage[] =>
    msgs.map((m) => ({ role: m.role, content: m.content }));

  // 核心流式生成；continueFromIndex 提供时表示「继续生成」该助手消息
  const runStream = async (
    baseHistory: UIMessage[],
    opts: { continueFromIndex?: number; images?: Attachment[] } = {}
  ) => {
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const isContinue = typeof opts.continueFromIndex === "number";
    try {
      const jb = (settings.jailbreak ?? "").trim();
      // 构造 API 请求 messages
      let apiMsgs: any[] = sanitize(baseHistory);
      if (isContinue) {
        // 在历史末尾追加引导，让模型从中断处继续
        apiMsgs = [
          ...apiMsgs,
          { role: "user", content: "请从上次中断处继续输出，不要重复已经生成过的内容，也不要重新开头。" },
        ];
      }
      let payload: any[] = jb ? [{ role: "system", content: jb }, ...apiMsgs] : apiMsgs;
      const images = opts.images ?? [];
      if (images.length > 0 && !isContinue) {
        const last = payload[payload.length - 1];
        payload[payload.length - 1] = {
          role: "user",
          content: [
            { type: "text", text: last.content },
            ...images.map((im) => ({ type: "image_url", image_url: { url: im.dataUrl! } })),
          ],
        };
      }
      const targetIdx = isContinue ? opts.continueFromIndex! : -1;
      let acc = isContinue ? (baseHistory[targetIdx]?.content ?? "") : "";
      // 清除占位/恢复中的暂停标记
      if (isContinue) {
        setMessages((prev) => {
          const copy = [...prev];
          if (copy[targetIdx]) copy[targetIdx] = { ...copy[targetIdx], paused: false, error: undefined };
          return copy;
        });
      }
      const streamResult: StreamResult = await streamChat({
        settings,
        messages: payload as ChatMessage[],
        signal: ctrl.signal,
        onDelta: (d) => {
          acc += d;
          setMessages((prev) => {
            const copy = [...prev];
            const idx = isContinue ? targetIdx : copy.length - 1;
            if (copy[idx]) copy[idx] = { role: "assistant", content: acc };
            return copy;
          });
        },
      });

      // 存储 finishReason 和 usage 到消息元数据
      setMessages((prev) => {
        const copy = [...prev];
        const idx = isContinue ? targetIdx : copy.length - 1;
        if (copy[idx] && copy[idx].role === "assistant") {
          copy[idx] = {
            ...copy[idx],
            finishReason: streamResult.finishReason,
            usage: streamResult.usage,
          };
        }
        return copy;
      });

      // 根据 finishReason 给出提示
      if (streamResult.finishReason === "length") {
        toast.warning("回复被截断", { description: "已达到最大输出长度，可点击继续生成" });
      } else if (streamResult.finishReason === "content_filter") {
        toast.error("内容被安全过滤", { description: "模型拒绝了此请求，请尝试修改提示词" });
      } else if (streamResult.refusal) {
        toast.error("模型拒绝回答", { description: streamResult.refusal });
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        // 用户主动暂停
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (!isContinue && last && last.role === "assistant" && !last.content) {
            // 还没有任何内容 → 移除空占位
            return copy.slice(0, -1);
          }
          const idx = isContinue ? (opts.continueFromIndex as number) : copy.length - 1;
          if (copy[idx] && copy[idx].role === "assistant") {
            copy[idx] = { ...copy[idx], paused: true, error: undefined };
          }
          return copy;
        });
      } else {
        toast.error("对话出错", { description: e.message });
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (!isContinue && last && last.role === "assistant" && !last.content) {
            return copy.slice(0, -1);
          }
          const idx = isContinue ? (opts.continueFromIndex as number) : copy.length - 1;
          if (copy[idx] && copy[idx].role === "assistant") {
            copy[idx] = { ...copy[idx], error: e.message || "网络错误", paused: false };
          }
          return copy;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if ((!text && attachments.length === 0) || loading) return;
    if (!settings.apiKey) {
      toast.error("请先在「设置」中填入 API 密钥");
      return;
    }
    if (!settings.chatModel) {
      toast.error("请先选择或手动输入对话模型");
      return;
    }
    // 尝试拉取模型列表做校验；失败（不支持 /models 的网关）则跳过校验直接使用当前模型
    let available = getAllModels(settings.baseUrl);
    if (available.length === 0) {
      try {
        available = await fetchModels(settings);
      } catch {
        // 网关不提供模型列表：信任用户手动配置的模型，继续发送
        available = [];
      }
    }
    if (available.length > 0) {
      const check = validateModel(settings.chatModel, available, "chat");
      if (check.ok !== true) {
        const { message, suggestion } = check;
        if (suggestion) {
          toast.error(message, {
            description: `建议替换为：${suggestion}`,
            action: {
              label: "使用建议",
              onClick: () => {
                const next = { ...settings, chatModel: suggestion };
                saveSettings(next);
                onSettingsChange?.(next);
                toast.success(`已切换到 ${suggestion}`);
              },
            },
          });
        } else {
          toast.error(message, { description: "请在顶部模型选择器中重新选择" });
        }
        return;
      }
    }
    // 拼装文本：附带文本文件内容 + 图片说明
    const textParts: string[] = [];
    if (text) textParts.push(text);
    for (const a of attachments) {
      if (a.kind === "text" && a.text != null) {
        textParts.push(`\n[文件: ${a.name}]\n\`\`\`\n${a.text.slice(0, 20000)}\n\`\`\``);
      }
    }
    const userText = textParts.join("\n") || "（见附件）";
    const next: UIMessage[] = [...messages, { role: "user", content: userText }];
    const images = attachments.filter((a) => a.kind === "image" && a.dataUrl);
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setAttachments([]);
    await runStream(next, { images });
  };

  // 继续生成：在上一条助手消息基础上续写
  const continueGenerate = async (idx: number) => {
    if (loading) return;
    const msg = messages[idx];
    if (!msg || msg.role !== "assistant") return;
    // 历史 = 该消息之前 + 该消息本身（作为已开始的 assistant 内容）
    const history = messages.slice(0, idx + 1);
    await runStream(history, { continueFromIndex: idx });
  };

  const stop = () => abortRef.current?.abort();

  // 卸载时取消进行中的请求，避免残留
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const createNewSession = () => {
    // 若当前对话为空，则不重复创建
    if (current && current.messages.length === 0) {
      setCurrentId(current.id);
      return;
    }
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setCurrentId(s.id);
  };
  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const fresh = newSession();
        setCurrentId(fresh.id);
        return [fresh];
      }
      if (id === currentId) setCurrentId(next[0].id);
      return next;
    });
    toast.success("已删除");
  };
  const renameSession = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    const t = window.prompt("重命名对话", s.title || "");
    if (t == null) return;
    const title = t.trim() || "未命名对话";
    setSessions((prev) => prev.map((x) => (x.id === id ? { ...x, title } : x)));
  };
  const clearAllSessions = () => {
    if (!window.confirm("确定清空全部对话历史？此操作不可恢复。")) return;
    const fresh = newSession();
    setSessions([fresh]);
    setCurrentId(fresh.id);
    try { localStorage.removeItem(CHAT_KEY); } catch {}
    toast.success("已清空全部历史");
  };
  const togglePin = (id: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
  };
  const exportSessions = () => {
    try {
      const data = JSON.stringify({ version: 1, exportedAt: Date.now(), sessions }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-history-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${sessions.length} 条对话`);
    } catch (e: any) {
      toast.error("导出失败", { description: e.message });
    }
  };
  const importSessions = async (file: File) => {
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const arr: any[] = Array.isArray(obj) ? obj : Array.isArray(obj?.sessions) ? obj.sessions : [];
      if (!arr.length) { toast.error("文件中没有可导入的对话"); return; }
      const norm: Session[] = arr
        .filter((s) => s && Array.isArray(s.messages))
        .map((s) => ({
          id: typeof s.id === "string" ? s.id : uuid(),
          title: typeof s.title === "string" ? s.title : "导入的对话",
          messages: s.messages,
          updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
          pinned: !!s.pinned,
        }));
      if (!norm.length) { toast.error("文件格式不正确"); return; }
      setSessions((prev) => {
        const exists = new Set(prev.map((s) => s.id));
        const merged = [...prev];
        for (const s of norm) {
          if (exists.has(s.id)) s.id = uuid();
          merged.push(s);
        }
        return merged;
      });
      toast.success(`已导入 ${norm.length} 条对话`);
    } catch (e: any) {
      toast.error("导入失败", { description: e.message });
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const focusTa = () => textareaRef.current?.focus();
  const handleCopy = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd) || ta.value;
    if (!sel) return toast.message("没有可复制的内容");
    try { await navigator.clipboard.writeText(sel); toast.success("已复制"); } catch { toast.error("复制失败"); }
  };
  const handlePaste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const ta = textareaRef.current;
      if (!ta) { setInput((v) => v + t); return; }
      const s = ta.selectionStart, e = ta.selectionEnd;
      const next = ta.value.slice(0, s) + t + ta.value.slice(e);
      setInput(next);
      requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + t.length; });
    } catch { toast.error("无法读取剪贴板"); }
  };
  const handleSelectAll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  };
  const handleClear = () => {
    setInput("");
    setAttachments([]);
    focusTa();
  };

  const readFiles = async (files: FileList | null, only?: "image") => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const next: Attachment[] = [];
    for (const f of arr) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} 超过 8MB`); continue; }
      const isImg = f.type.startsWith("image/");
      if (only === "image" && !isImg) continue;
      if (isImg) {
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f);
        });
        next.push({ id: uuid(), name: f.name, kind: "image", size: f.size, dataUrl });
      } else {
        const text = await f.text().catch(() => "");
        next.push({ id: uuid(), name: f.name, kind: "text", size: f.size, text });
      }
    }
    if (next.length) setAttachments((p) => [...p, ...next]);
  };

  const onPasteTa = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgs: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile(); if (f) imgs.push(f);
      }
    }
    if (imgs.length) {
      e.preventDefault();
      const dt = new DataTransfer();
      imgs.forEach((f) => dt.items.add(f));
      readFiles(dt.files);
    }
  };

  const removeAttachment = (id: string) => setAttachments((p) => p.filter((a) => a.id !== id));

  // 把语音口令 / 英文标点等转换成中文书写风格
  const polishVoice = (raw: string): string => {
    if (!raw) return "";
    let s = raw;
    const repl: [RegExp, string][] = [
      // 段落 / 换行
      [/\s*(新段落|新的段落|另起一段|换段)\s*/g, "\n\n"],
      [/\s*(换行|回车|另起一行)\s*/g, "\n"],
      [/\s*(new\s*paragraph)\s*/gi, "\n\n"],
      [/\s*(new\s*line|line\s*break)\s*/gi, "\n"],
      // 中文口令 → 中文标点
      [/\s*[,，]?\s*(逗号)\s*/g, "，"],
      [/\s*[。.]?\s*(句号|句点)\s*/g, "。"],
      [/\s*(问号)\s*/g, "？"],
      [/\s*(感叹号|惊叹号)\s*/g, "！"],
      [/\s*(冒号)\s*/g, "："],
      [/\s*(分号)\s*/g, "；"],
      [/\s*(顿号)\s*/g, "、"],
      [/\s*(省略号)\s*/g, "……"],
      [/\s*(破折号)\s*/g, "——"],
      [/\s*(左括号|开括号)\s*/g, "（"],
      [/\s*(右括号|闭括号)\s*/g, "）"],
      [/\s*(左引号|开引号)\s*/g, "“"],
      [/\s*(右引号|闭引号|关引号)\s*/g, "”"],
      // 英文口令
      [/\s*\b(comma)\b\s*/gi, "，"],
      [/\s*\b(period|full stop|dot)\b\s*/gi, "。"],
      [/\s*\b(question mark)\b\s*/gi, "？"],
      [/\s*\b(exclamation mark|exclamation point)\b\s*/gi, "！"],
      [/\s*\b(colon)\b\s*/gi, "："],
      [/\s*\b(semicolon)\b\s*/gi, "；"],
    ];
    for (const [re, to] of repl) s = s.replace(re, to);
    // 英文半角标点 → 中文全角（仅在中文上下文）
    s = s
      .replace(/([\u4e00-\u9fa5])\s*,\s*/g, "$1，")
      .replace(/([\u4e00-\u9fa5])\s*\.\s*(?!\d)/g, "$1。")
      .replace(/([\u4e00-\u9fa5])\s*\?\s*/g, "$1？")
      .replace(/([\u4e00-\u9fa5])\s*!\s*/g, "$1！")
      .replace(/([\u4e00-\u9fa5])\s*:\s*/g, "$1：")
      .replace(/([\u4e00-\u9fa5])\s*;\s*/g, "$1；");
    // 去掉中文字符之间多余的空格
    s = s.replace(/([\u4e00-\u9fa5，。！？；：、“”（）])\s+(?=[\u4e00-\u9fa5，。！？；：、“”（）])/g, "$1");
    // 合并多余空格 / 换行
    s = s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
    // 删除标点前的空格
    s = s.replace(/\s+([，。！？；：、）”])/g, "$1");
    // 句末自动补句号
    const trimmed = s.trimEnd();
    if (trimmed && !/[。！？…”\)）.!?\n]$/.test(trimmed)) {
      s = trimmed + (/[\u4e00-\u9fa5]$/.test(trimmed) ? "。" : ".");
    }
    return s.trim();
  };

  const applyPolish = () => {
    const polished = polishVoice(input);
    if (!polished) return toast.message("没有可整理的内容");
    setDraft(polished);
  };

  const acceptDraft = () => {
    setInput(draft);
    setDraft("");
    toast.success("已应用整理后的文本");
    requestAnimationFrame(() => focusTa());
  };

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("当前浏览器不支持语音输入", { description: "请使用 Chrome / Edge 等浏览器" });
      return;
    }
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    baseTextRef.current = input ? input + (input.endsWith(" ") ? "" : " ") : "";
    rec.onstart = () => { setListening(true); setDraft(""); };
    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error !== "aborted" && e.error !== "no-speech") {
        toast.error("语音识别出错", { description: e.error });
      }
    };
    rec.onend = () => { setListening(false); recognitionRef.current = null; };
    rec.onresult = (e: any) => {
      let finalT = "", interimT = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalT += r[0].transcript;
        else interimT += r[0].transcript;
      }
      if (finalT) baseTextRef.current += finalT;
      const live = baseTextRef.current + interimT;
      setInput(live);
      // 实时生成整理后预览
      setDraft(polishVoice(live));
    };
    try { rec.start(); recognitionRef.current = rec; } catch (err: any) {
      toast.error("无法启动语音识别", { description: err.message });
    }
  };

  return (
    <div className="glass rounded-2xl flex flex-col h-[88vh] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 md:px-5 py-3">
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium hidden sm:inline">智能对话</span>
        </div>
        <div className="flex-1 max-w-xs min-w-0">
          <ModelPicker
            settings={settings}
            value={settings.chatModel}
            onChange={(v) => {
              const next = { ...settings, chatModel: v };
              saveSettings(next);
              onSettingsChange?.(next);
            }}
            filter={(id) => !isMediaModel(id)}
            placeholder="选择对话模型"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={createNewSession}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>新建对话</TooltipContent>
            </Tooltip>
            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                      <History className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                </TooltipTrigger>
                <TooltipContent>历史记录</TooltipContent>
              </Tooltip>
              <SheetContent side="right" className="w-[340px] sm:w-[380px] p-0 flex flex-col">
                <SheetHeader className="px-4 py-3 border-b border-border/60">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4 text-primary" /> 对话历史
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{sessions.length} 条</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
                  <Button size="sm" variant="hero" className="flex-1 gap-1.5" onClick={() => { createNewSession(); setHistoryOpen(false); }}>
                    <Plus className="h-4 w-4" /> 新建对话
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-primary" onClick={exportSessions} title="导出">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>导出</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-primary" onClick={() => importInputRef.current?.click()} title="导入">
                        <Upload className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>导入</TooltipContent>
                  </Tooltip>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) importSessions(f); e.target.value = ""; }}
                  />
                  {sessions.length > 0 && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={clearAllSessions} title="清空全部">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="px-3 py-2 border-b border-border/60">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={historyQuery}
                      onChange={(e) => setHistoryQuery(e.target.value)}
                      placeholder="搜索标题或内容..."
                      className="w-full rounded-md border border-border/60 bg-input/60 pl-8 pr-7 py-1.5 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40"
                    />
                    {historyQuery && (
                      <button onClick={() => setHistoryQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  {(() => {
                    const q = historyQuery.trim().toLowerCase();
                    const filtered = q
                      ? sessions.filter((s) =>
                          (s.title || "").toLowerCase().includes(q) ||
                          s.messages.some((m) => typeof m.content === "string" && m.content.toLowerCase().includes(q))
                        )
                      : sessions;
                    const sorted = [...filtered].sort((a, b) => {
                      if (!!b.pinned !== !!a.pinned) return Number(!!b.pinned) - Number(!!a.pinned);
                      return b.updatedAt - a.updatedAt;
                    });
                    if (sorted.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                          {q ? "没有匹配的对话" : "暂无历史记录"}
                        </div>
                      );
                    }
                    return (
                    <ul className="py-1">
                      {sorted.map((s) => (
                        <li
                          key={s.id}
                          className={cn(
                            "group mx-2 my-1 rounded-lg border border-transparent px-3 py-2 cursor-pointer transition-colors",
                            s.id === current?.id
                              ? "bg-primary/10 border-primary/40"
                              : "hover:bg-card/60 hover:border-border/60"
                          )}
                          onClick={() => { setCurrentId(s.id); setHistoryOpen(false); }}
                        >
                          <div className="flex items-start gap-2">
                            {s.pinned ? <Pin className="h-4 w-4 mt-0.5 text-primary shrink-0 fill-primary/30" /> : <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{s.title || "未命名对话"}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                <span>{s.messages.length} 条消息</span>
                                <span>·</span>
                                <span>{new Date(s.updatedAt).toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePin(s.id); }}
                                title={s.pinned ? "取消置顶" : "置顶"}
                                className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-background/60"
                              >
                                {s.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); renameSession(s.id); }}
                                title="重命名"
                                className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-background/60"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                                title="删除"
                                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    );
                  })()}
                </div>
              </SheetContent>
            </Sheet>
          </TooltipProvider>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center gap-6 py-10">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl animate-pulse-glow" />
              <div className="relative rounded-full bg-card p-5 ring-1 ring-primary/40">
                <Bot className="h-10 w-10 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gradient">开始一段对话</h3>
              <p className="text-sm text-muted-foreground mt-1">提出任何问题，让 AI 为你解答</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-left text-sm hover:border-primary/60 hover:bg-primary/5 transition-all hover:-translate-y-0.5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <div className={cn(
              "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ring-1",
              m.role === "user" ? "bg-secondary/20 ring-secondary/40 text-secondary" : "bg-primary/15 ring-primary/40 text-primary"
            )}>
              {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed group relative",
              m.role === "user"
                ? "bg-secondary/15 border border-secondary/30"
                : "bg-card/70 border border-border/60"
            )}>
              {m.content ? (
                <>
                  <div className="prose prose-invert prose-base max-w-none prose-pre:bg-transparent prose-pre:border-0 prose-pre:text-[15px] prose-pre:leading-relaxed prose-code:text-secondary prose-code:font-medium prose-code:text-[14px] prose-code:before:content-none prose-code:after:content-none prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
                    <ReactMarkdown
                      components={{
                        img: ({ node, ...props }: any) => <SmartImage {...props} />,
                        p: ({ node, children, ...props }: any) => (
                          <p {...props}>{children}</p>
                        ),
                        code: ({ node, inline, className, children, ...props }: any) => {
                          const match = /language-(\w+)/.exec(className || "");
                          const code = String(children).replace(/\n$/, "");
                          const lang = (match?.[1] || "").toLowerCase();
                          const runnable = ["html", "htm", "svg", "xml"].includes(lang) || /<\s*(html|body|svg|!doctype)/i.test(code);

                          if (inline) {
                            return <code className={className} {...props}>{children}</code>;
                          }

                          return (
                            <div className="relative group">
                              <pre className={className} {...props}>
                                <code>{code}</code>
                              </pre>
                              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {runnable && (
                                  <button
                                    onClick={() => setRunHtml(code)}
                                    className="rounded p-1.5 bg-background/60 hover:bg-background text-emerald-400 hover:text-emerald-300"
                                    title="运行 HTML"
                                  >
                                    <Play className="h-4 w-4" />
                                  </button>
                                )}
                              <button
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(code);
                                    toast.success("代码已复制");
                                  } catch {
                                    toast.error("复制失败");
                                  }
                                }}
                                className="rounded p-1.5 bg-background/60 hover:bg-background text-muted-foreground hover:text-primary"
                                title="复制代码"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              </div>
                            </div>
                          );
                        },
                      }}
                    >
                      {autoLinkImages(m.content)}
                    </ReactMarkdown>
                  </div>
                  {m.role === "assistant" && (
                    <div className="mt-2 text-xs text-muted-foreground pt-2 flex items-center gap-2 flex-wrap">
                      <span>字数：{m.content.length}</span>
                      {m.usage?.total_tokens && (
                        <span>Tokens：{m.usage.total_tokens.toLocaleString()}</span>
                      )}
                      {m.finishReason === "length" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5">
                          <AlertTriangle className="h-3 w-3" /> 已截断
                        </span>
                      )}
                      {m.finishReason === "content_filter" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-0.5">
                          <AlertTriangle className="h-3 w-3" /> 内容过滤
                        </span>
                      )}
                      {m.paused && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5">
                          <PauseCircle className="h-3 w-3" /> 已暂停 · 可继续
                        </span>
                      )}
                      {m.error && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-0.5" title={m.error}>
                          <AlertTriangle className="h-3 w-3" /> 已中断
                        </span>
                      )}
                      {(m.paused || m.error || m.finishReason === "length") && i === messages.length - 1 && !loading && (
                        <Button
                          size="sm"
                          variant="glow"
                          className="h-6 gap-1 text-xs px-2 ml-auto"
                          onClick={() => continueGenerate(i)}
                        >
                          {m.error ? <RefreshCw className="h-3 w-3" /> : <PlayCircle className="h-3 w-3" />}
                          {m.error ? "重试继续" : "继续生成"}
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                loading && i === messages.length - 1 ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="text-xs text-muted-foreground italic">（无内容）</span>
                )
              )}
              {m.role === "assistant" && m.content && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(m.content);
                      toast.success("已复制");
                    } catch {
                      toast.error("复制失败");
                    }
                  }}
                  className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-card/60"
                  title="复制内容"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border/60 p-3 md:p-4">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="group relative flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 pl-2 pr-7 py-1.5 text-xs">
                {a.kind === "image" && a.dataUrl ? (
                  <img src={a.dataUrl} alt={a.name} className="h-8 w-8 rounded object-cover" />
                ) : (
                  <FileText className="h-4 w-4 text-primary" />
                )}
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button onClick={() => removeAttachment(a.id)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-destructive/20">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <TooltipProvider delayDuration={200}>
          <div className="mb-2 flex items-center gap-1">
            {[
              { icon: Copy, label: "复制", onClick: handleCopy },
              { icon: ClipboardPaste, label: "粘贴", onClick: handlePaste },
              { icon: TextSelect, label: "全选", onClick: handleSelectAll },
              { icon: Eraser, label: "清空", onClick: handleClear },
            ].map((b) => (
              <Tooltip key={b.label}>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={b.onClick}>
                    <b.icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{b.label}</TooltipContent>
              </Tooltip>
            ))}
            <div className="mx-1 h-5 w-px bg-border/60" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={toggleVoice}
                  className={cn(
                    "h-8 w-8 hover:text-primary",
                    listening
                      ? "text-destructive bg-destructive/10 animate-pulse"
                      : "text-muted-foreground"
                  )}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{listening ? "停止录音" : "语音输入"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>上传图片</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>上传文件</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={applyPolish}
                  disabled={!input.trim()}
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>整理标点 / 换行</TooltipContent>
            </Tooltip>
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { readFiles(e.target.files, "image"); e.target.value = ""; }} />
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { readFiles(e.target.files); e.target.value = ""; }} />
          </div>
        </TooltipProvider>
        {draft && (
          <div className="mb-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Wand2 className="h-3.5 w-3.5" /> 整理预览（中文标点 / 换行）
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraft("")}>
                  取消
                </Button>
                <Button size="sm" variant="hero" className="h-7 gap-1 text-xs" onClick={acceptDraft}>
                  <Check className="h-3.5 w-3.5" /> 应用到输入框
                </Button>
              </div>
            </div>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-sans text-foreground/90">{draft}</pre>
          </div>
        )}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            onPaste={onPasteTa}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
            className="min-h-[60px] max-h-40 resize-none pr-14 bg-input/60 border-border/60 focus-visible:ring-primary/50"
          />
          <div className="absolute right-2 bottom-2">
            {loading ? (
              <Button size="icon" variant="destructive" onClick={stop}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" variant="hero" onClick={() => send()} disabled={!input.trim() && attachments.length === 0}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <Dialog open={!!runHtml} onOpenChange={(o) => !o && setRunHtml(null)}>
        <DialogContent className="max-w-4xl w-[92vw] h-[80vh] p-0 flex flex-col gap-0">
          <DialogHeader className="px-4 py-3 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4 text-emerald-400" /> 运行 HTML 预览
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={async () => {
                    if (!runHtml) return;
                    try { await navigator.clipboard.writeText(runHtml); toast.success("代码已复制"); }
                    catch { toast.error("复制失败"); }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> 复制
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    if (!runHtml) return;
                    const blob = new Blob([runHtml], { type: "text/html;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" /> 新窗口打开
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <iframe
            title="HTML 预览"
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
            className="flex-1 w-full bg-white rounded-b-lg"
            srcDoc={runHtml ?? ""}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPanel;
