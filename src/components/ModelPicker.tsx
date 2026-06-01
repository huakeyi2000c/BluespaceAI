import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, RefreshCw, Loader2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AISettings, fetchModels } from "@/lib/aiClient";
import { toast } from "sonner";

const MANUAL_KEY = "ai_models_manual_v1";
function loadManual(baseUrl: string): string[] {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw);
    return Array.isArray(map[baseUrl]) ? map[baseUrl] : [];
  } catch { return []; }
}
function saveManual(baseUrl: string, list: string[]) {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[baseUrl] = list;
    localStorage.setItem(MANUAL_KEY, JSON.stringify(map));
  } catch {}
}

const CACHE_KEY = "ai_models_cache_v1";

interface CacheShape { baseUrl: string; models: string[]; ts: number }

function loadCache(baseUrl: string): string[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const c: CacheShape = JSON.parse(raw);
    return c.baseUrl === baseUrl ? c.models : [];
  } catch { return []; }
}
function saveCache(baseUrl: string, models: string[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ baseUrl, models, ts: Date.now() }));
}

interface Props {
  settings: AISettings;
  value: string;
  onChange: (v: string) => void;
  filter?: (id: string) => boolean;
  placeholder?: string;
  autoLoad?: boolean;
}

const ModelPicker = ({ settings, value, onChange, filter, placeholder = "选择模型", autoLoad = true }: Props) => {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>(() => loadCache(settings.baseUrl));
  const [manual, setManual] = useState<string[]>(() => loadManual(settings.baseUrl));
  const [loading, setLoading] = useState(false);
  const [manualInput, setManualInput] = useState("");

  const refresh = async (silent = false) => {
    setLoading(true);
    try {
      const list = await fetchModels(settings);
      setModels(list);
      saveCache(settings.baseUrl, list);
      if (!silent) {
        const filtered = filter ? list.filter(filter).length : list.length;
        const msg = filtered < list.length
          ? `已加载 ${list.length} 个模型，筛选后 ${filtered} 个`
          : `已加载 ${list.length} 个模型`;
        toast.success(msg);
      }
    } catch (e: any) {
      if (!silent) toast.error("加载失败，可手动输入模型名", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setManual(loadManual(settings.baseUrl));
    if (autoLoad && settings.apiKey && models.length === 0) refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.apiKey, settings.baseUrl]);

  const merged = useMemo(() => {
    const all = Array.from(new Set([...manual, ...models]));
    return filter ? all.filter(filter) : all;
  }, [models, manual, filter]);

  const addManual = (raw?: string) => {
    const id = (raw ?? manualInput).trim();
    if (!id) return;
    if (!manual.includes(id) && !models.includes(id)) {
      const next = [id, ...manual];
      setManual(next);
      saveManual(settings.baseUrl, next);
    }
    onChange(id);
    setManualInput("");
    setOpen(false);
    toast.success(`已添加模型：${id}`);
  };

  const removeManual = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = manual.filter((m) => m !== id);
    setManual(next);
    saveManual(settings.baseUrl, next);
  };

  return (
    <div className="flex gap-2 min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="flex-1 justify-between font-mono text-xs h-10 min-h-[44px] bg-input/60 overflow-hidden"
          >
            <span className="truncate">{value || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-popover/95 backdrop-blur-xl border-border/60" align="start" style={{ width: 'var(--radix-popover-trigger-width, 280px)' }}>
          <Command>
            <CommandInput placeholder="搜索模型..." className="h-10" />
            <div className="flex gap-1 border-b border-border/60 p-2">
              <Input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
                placeholder="手动输入模型名，如 gpt-4o-mini"
                className="h-9 min-h-[36px] font-mono text-xs"
              />
              <Button type="button" size="icon" variant="secondary" className="h-9 w-9 shrink-0 min-h-[36px] min-w-[36px]" onClick={() => addManual()} title="添加">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <CommandList className="max-h-60 overflow-auto ios-scroll">
              <CommandEmpty>
                {loading ? "加载中..." : merged.length === 0 ? "上方手动输入或点右侧刷新加载" : "未找到匹配模型"}
              </CommandEmpty>
              <CommandGroup>
                {merged.map((m) => (
                  <CommandItem
                    key={m}
                    value={m}
                    onSelect={() => { onChange(m); setOpen(false); }}
                    className="font-mono text-xs group"
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === m ? "opacity-100 text-primary" : "opacity-0")} />
                    <span className="truncate flex-1">{m}</span>
                    {manual.includes(m) && (
                      <span
                        onClick={(e) => removeManual(m, e)}
                        className="ml-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-[11px] min-h-[28px] min-w-[28px] flex items-center justify-center"
                        title="删除手动模型"
                      >
                        移除
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="outline" size="icon" onClick={() => refresh(false)} disabled={loading} title="刷新模型列表" className="min-h-[44px] min-w-[44px] shrink-0">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      </Button>
    </div>
  );
};

export default ModelPicker;