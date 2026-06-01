import { useEffect, useRef, useState, RefObject } from "react";
import { Copy, ClipboardPaste, TextSelect, Eraser, Mic, MicOff, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
}

const TextareaToolbar = ({ textareaRef, value, onChange }: Props) => {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef("");

  // 历史栈：撤销/重做
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const lastValueRef = useRef<string>(value);
  const skipNextRef = useRef(false);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  useEffect(() => {
    if (value === lastValueRef.current) return;
    if (skipNextRef.current) {
      skipNextRef.current = false;
      lastValueRef.current = value;
      return;
    }
    pastRef.current.push(lastValueRef.current);
    if (pastRef.current.length > 100) pastRef.current.shift();
    futureRef.current = [];
    lastValueRef.current = value;
    rerender();
  }, [value]);

  const handleUndo = () => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push(lastValueRef.current);
    skipNextRef.current = true;
    lastValueRef.current = prev;
    onChange(prev);
    requestAnimationFrame(() => textareaRef.current?.focus());
    rerender();
  };
  const handleRedo = () => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push(lastValueRef.current);
    skipNextRef.current = true;
    lastValueRef.current = next;
    onChange(next);
    requestAnimationFrame(() => textareaRef.current?.focus());
    rerender();
  };

  const focusTa = () => textareaRef.current?.focus();

  const handleCopy = async () => {
    const ta = textareaRef.current;
    const sel = ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd) || ta.value : value;
    if (!sel) return toast.message("没有可复制的内容");
    try { await navigator.clipboard.writeText(sel); toast.success("已复制"); } catch { toast.error("复制失败"); }
  };
  const handlePaste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const ta = textareaRef.current;
      if (!ta) { onChange(value + t); return; }
      const s = ta.selectionStart, e = ta.selectionEnd;
      const next = ta.value.slice(0, s) + t + ta.value.slice(e);
      onChange(next);
      requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + t.length; });
    } catch { toast.error("无法读取剪贴板"); }
  };
  const handleSelectAll = () => { const ta = textareaRef.current; if (!ta) return; ta.focus(); ta.select(); };
  const handleClear = () => { onChange(""); focusTa(); };

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("当前浏览器不支持语音输入", { description: "请使用 Chrome / Edge 等浏览器" }); return; }
    const rec = new SR();
    rec.lang = "zh-CN"; rec.continuous = true; rec.interimResults = true;
    baseTextRef.current = value ? value + (value.endsWith(" ") ? "" : " ") : "";
    rec.onstart = () => setListening(true);
    rec.onerror = (e: any) => { setListening(false); if (e.error !== "aborted" && e.error !== "no-speech") toast.error("语音识别出错", { description: e.error }); };
    rec.onend = () => { setListening(false); recognitionRef.current = null; };
    rec.onresult = (e: any) => {
      let finalT = "", interimT = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalT += r[0].transcript; else interimT += r[0].transcript;
      }
      if (finalT) baseTextRef.current += finalT;
      onChange(baseTextRef.current + interimT);
    };
    try { rec.start(); recognitionRef.current = rec; } catch (err: any) { toast.error("无法启动语音识别", { description: err.message }); }
  };

  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch {} }, []);

  const btns = [
    { icon: Undo2, label: "撤销", onClick: handleUndo, disabled: pastRef.current.length === 0 },
    { icon: Redo2, label: "重做", onClick: handleRedo, disabled: futureRef.current.length === 0 },
    { icon: Copy, label: "复制", onClick: handleCopy, disabled: false },
    { icon: ClipboardPaste, label: "粘贴", onClick: handlePaste, disabled: false },
    { icon: TextSelect, label: "全选", onClick: handleSelectAll, disabled: false },
    { icon: Eraser, label: "清空", onClick: handleClear, disabled: false },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1">
        {btns.map((b) => (
          <Tooltip key={b.label}>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" variant="ghost" disabled={b.disabled} className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={b.onClick}>
                <b.icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{b.label}</TooltipContent>
          </Tooltip>
        ))}
        <div className="mx-1 h-5 w-px bg-border/60" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="ghost" onClick={toggleVoice}
              className={cn("h-8 w-8 hover:text-primary", listening ? "text-destructive bg-destructive/10 animate-pulse" : "text-muted-foreground")}>
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{listening ? "停止录音" : "语音输入"}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default TextareaToolbar;