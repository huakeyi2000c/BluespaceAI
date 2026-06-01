import { useRef, useState } from "react";
import { Eye, EyeOff, Save, KeyRound, PlugZap, Trash2, Download, Upload, Loader2, RotateCcw, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AISettings, GenerationConfig, isMediaModel, detectModelKind, saveSettings, fetchModels, loadSettings, DEFAULT_SETTINGS, probeModel } from "@/lib/aiClient";
import { toast } from "sonner";
import ModelPicker from "./ModelPicker";

interface Props {
  settings: AISettings;
  onChange: (s: AISettings) => void;
}

const CACHE_KEY = "ai_models_cache_v1";
const MANUAL_KEY = "ai_models_manual_v1";

const SettingsPanel = ({ settings, onChange }: Props) => {
  const [draft, setDraft] = useState(settings);
  const [show, setShow] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testModels, setTestModels] = useState<string[] | null>(null);
  const [probeResults, setProbeResults] = useState<{ id: string; ok: boolean; message?: string }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const copyText = (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => toast.success(`已复制：${text}`),
          () => fallbackCopy(text),
        );
      } else {
        fallbackCopy(text);
      }
    } catch {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast.success(`已复制：${text}`); }
    catch { toast.error("复制失败"); }
    document.body.removeChild(ta);
  };

  const update = (k: keyof AISettings, v: string) => {
    const updated = { ...draft, [k]: v };
    if (k === "apiKey") updated._isEnvKey = false;
    setDraft(updated);
    if (k === "chatModel" || k === "imageModel") {
      const kind = detectModelKind(v);
      toast.message(`已识别为${kind}模型`, { description: v });
    }
  };

  const updateGenConfig = (k: keyof GenerationConfig, v: number | string | string[] | { type: string } | undefined) => {
    const current = draft.generationConfig ?? {};
    const next = { ...current, [k]: v };
    // 如果值为 undefined 或空，删除该字段
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
      delete next[k];
    }
    setDraft({ ...draft, generationConfig: Object.keys(next).length > 0 ? next : undefined });
  };

  const onSave = () => {
    saveSettings(draft);
    onChange(draft);
    toast.success("设置已保存", { description: "密钥安全存储在本地浏览器中" });
  };

  const onTest = async () => {
    setTesting(true);
    setTestModels(null);
    setProbeResults(null);
    try {
      const list = await fetchModels(draft);
      setTestModels(list);
      toast.success("连接成功", { description: `共发现 ${list.length} 个模型` });
    } catch (e: any) {
      // /models 不可用：改为逐个 ping 已配置 / 手动添加的模型
      try {
        const manualRaw = localStorage.getItem(MANUAL_KEY);
        const manualMap = manualRaw ? JSON.parse(manualRaw) : {};
        const manual: string[] = Array.isArray(manualMap[draft.baseUrl]) ? manualMap[draft.baseUrl] : [];
        const candidates = Array.from(new Set([draft.chatModel, draft.imageModel, ...manual].filter(Boolean))).slice(0, 8);
        if (candidates.length === 0) {
          toast.error("连接失败", { description: e.message });
          return;
        }
        toast.message("未提供模型列表接口，正在逐个探测已配置模型…");
        const results = await Promise.all(candidates.map(async (id) => {
          const r = await probeModel(draft, id);
          return { id, ok: r.ok, message: r.message };
        }));
        setProbeResults(results);
        const okCount = results.filter(r => r.ok).length;
        if (okCount > 0) toast.success(`探测完成：${okCount}/${results.length} 个模型可用`);
        else toast.error("所有已配置模型均不可用", { description: results[0]?.message });
      } catch (err: any) {
        toast.error("连接失败", { description: err?.message || e.message });
      }
    } finally {
      setTesting(false);
    }
  };

  const onClearCache = () => {
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(MANUAL_KEY);
      localStorage.removeItem("ai_settings_v1");
      // 重新加载：若环境变量里有 API 密钥则自动回填
      const fresh = loadSettings();
      setDraft(fresh);
      setTestModels(null);
      setProbeResults(null);
      onChange(fresh);
      const envRestored = fresh._isEnvKey && !!fresh.apiKey;
      toast.success("已清空缓存并重置", {
        description: envRestored
          ? "已恢复为环境变量中的初始 API 密钥"
          : "设置、模型缓存与手动模型均已清空",
      });
    } catch (e: any) {
      toast.error("清空失败", { description: e.message });
    }
  };

  const onExport = () => {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: { ...draft, apiKey: "" }, // 不导出密钥
        modelsCache: JSON.parse(localStorage.getItem(CACHE_KEY) || "null"),
        manualModels: JSON.parse(localStorage.getItem(MANUAL_KEY) || "null"),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-settings-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已导出配置", { description: "密钥未包含在导出文件中" });
    } catch (e: any) {
      toast.error("导出失败", { description: e.message });
    }
  };

  const onImport = async (file: File) => {
    // 快照用于失败回滚
    const snapshot = {
      draft,
      cache: localStorage.getItem(CACHE_KEY),
      manual: localStorage.getItem(MANUAL_KEY),
    };
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // 校验结构
      if (typeof data !== "object" || data === null) throw new Error("文件不是有效的 JSON 对象");
      if (data.settings && typeof data.settings !== "object") throw new Error("settings 字段格式错误");
      if (data.settings) {
        const s = data.settings;
        if (s.baseUrl !== undefined && typeof s.baseUrl !== "string") throw new Error("baseUrl 必须为字符串");
        if (s.chatModel !== undefined && typeof s.chatModel !== "string") throw new Error("chatModel 必须为字符串");
        if (s.imageModel !== undefined && typeof s.imageModel !== "string") throw new Error("imageModel 必须为字符串");
      }
      if (data.manualModels !== undefined && data.manualModels !== null && typeof data.manualModels !== "object") {
        throw new Error("manualModels 字段格式错误");
      }
      if (data.modelsCache !== undefined && data.modelsCache !== null) {
        if (typeof data.modelsCache !== "object" || !Array.isArray(data.modelsCache.models)) {
          throw new Error("modelsCache 字段格式错误");
        }
      }
      // 应用
      if (data.modelsCache) localStorage.setItem(CACHE_KEY, JSON.stringify(data.modelsCache));
      if (data.manualModels) localStorage.setItem(MANUAL_KEY, JSON.stringify(data.manualModels));
      if (data.settings) {
        const merged: AISettings = { ...draft, ...data.settings, apiKey: draft.apiKey, _isEnvKey: draft._isEnvKey };
        setDraft(merged);
      }
      toast.success("已导入配置", { description: "刷新模型列表查看导入结果" });
    } catch (e: any) {
      // 回滚
      setDraft(snapshot.draft);
      if (snapshot.cache === null) localStorage.removeItem(CACHE_KEY); else localStorage.setItem(CACHE_KEY, snapshot.cache);
      if (snapshot.manual === null) localStorage.removeItem(MANUAL_KEY); else localStorage.setItem(MANUAL_KEY, snapshot.manual);
      toast.error("导入失败，已回滚", { description: e.message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="glass rounded-2xl p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/15 p-2.5 ring-1 ring-primary/30">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">API 设置</h2>
          <p className="text-sm text-muted-foreground">兼容 OpenAI 协议的任意网关，密钥仅保存在你的浏览器</p>
        </div>
      </div>

      <div className="grid gap-5">
        <div className="space-y-2">
          <Label htmlFor="apikey">API 密钥</Label>
          <div className="relative">
            <Input
              id="apikey"
              type={show && !draft._isEnvKey ? "text" : "password"}
              value={draft._isEnvKey ? "" : draft.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder={draft._isEnvKey ? "使用环境变量配置" : "sk-..."}
              className="pr-10 font-mono"
            />
            {!draft._isEnvKey && (
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
                aria-label={show ? "隐藏密钥" : "显示密钥"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
          {draft._isEnvKey && (
            <p className="text-xs text-muted-foreground">
              当前使用的是网站免费密钥，用户可修改使用自己申请的密钥保存到本地
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            默认推荐 <a href="https://discord.gg/GNm8RQwTD" target="_blank" rel="noreferrer" className="text-primary hover:underline">FreeTheAI Discord</a> 获取免费密钥，或使用任何 OpenAI 兼容服务
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="baseurl">API 网关地址</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="baseurl"
              value={draft.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder="https://api.freetheai.xyz/v1"
              className="font-mono w-full text-xs"
            />
            <Button type="button" variant="outline" onClick={onTest} disabled={testing} title="测试连接 / GET /models" className="shrink-0 min-h-[44px] sm:w-auto w-full">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              <span className="ml-1.5">测试链接</span>
            </Button>
          </div>
          {testModels && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 max-h-52 overflow-auto ios-scroll">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs text-muted-foreground">发现 {testModels.length} 个模型（点击使用）</span>
                <button type="button" onClick={() => setTestModels(null)} className="text-xs text-muted-foreground hover:text-foreground min-h-[32px] min-w-[32px] flex items-center justify-center">关闭</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {testModels.slice(0, 80).map((m) => (
                  <div key={m} className="relative group/model">
                    <button
                      type="button"
                      onClick={() => update(isMediaModel(m) ? "imageModel" : "chatModel", m)}
                      className="font-mono text-xs px-2 py-1 pr-7 rounded bg-background/60 hover:bg-primary/15 hover:text-primary border border-border/40 min-h-[32px] transition-colors"
                      title={`识别为${detectModelKind(m)}模型，点击使用`}
                    >
                      {m}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); copyText(m); }}
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/model:opacity-100 rounded p-0.5 text-muted-foreground hover:text-primary transition-opacity"
                      title="复制模型名"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {testModels.length > 80 && (
                  <span className="text-xs text-muted-foreground self-center">…还有 {testModels.length - 80} 个</span>
                )}
              </div>
            </div>
          )}
          {probeResults && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 max-h-52 overflow-auto ios-scroll group/probe">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs text-muted-foreground">该服务无模型列表接口，已逐个探测 {probeResults.length} 个已配置模型</span>
                <button type="button" onClick={() => setProbeResults(null)} className="text-xs text-muted-foreground hover:text-foreground min-h-[32px] min-w-[32px] flex items-center justify-center shrink-0">关闭</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {probeResults.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs font-mono min-h-[32px]">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${r.ok ? "bg-emerald-500" : "bg-destructive"}`} />
                    <span className="truncate flex-1">{r.id}</span>
                    <button
                      type="button"
                      onClick={() => copyText(r.id)}
                      className="shrink-0 opacity-0 group-hover/probe:opacity-100 rounded p-0.5 text-muted-foreground hover:text-primary transition-opacity"
                      title="复制模型名"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <span className={`shrink-0 ${r.ok ? "text-emerald-500" : "text-destructive"}`}>
                      {r.ok ? "可用" : (r.message?.slice(0, 60) || "不可用")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="chat">
              对话模型
              {draft.chatModel && (
                <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  {detectModelKind(draft.chatModel)}
                </span>
              )}
            </Label>
            <ModelPicker
              settings={draft}
              value={draft.chatModel}
              onChange={(v) => update("chatModel", v)}
              filter={(id) => !isMediaModel(id)}
              placeholder="选择对话模型"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="img">
              图像 / 媒体模型
              {draft.imageModel && (
                <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  {detectModelKind(draft.imageModel)}
                </span>
              )}
            </Label>
            <ModelPicker
              settings={draft}
              value={draft.imageModel}
              onChange={(v) => update("imageModel", v)}
              filter={(id) => isMediaModel(id)}
              placeholder="选择图像/媒体模型"
            />
          </div>
        </div>

        {/* 高级生成参数 */}
        <div className="rounded-lg border border-border/60 bg-muted/20">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>高级生成参数（Temperature / Max Tokens 等）</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showAdvanced && (
            <div className="px-3 pb-3 space-y-3 border-t border-border/40 pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Temperature ({draft.generationConfig?.temperature ?? "默认"})</Label>
                  <Input
                    type="number"
                    min={0} max={2} step={0.1}
                    value={draft.generationConfig?.temperature ?? ""}
                    onChange={(e) => updateGenConfig("temperature", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="0 ~ 2，留空用默认"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Top P ({draft.generationConfig?.top_p ?? "默认"})</Label>
                  <Input
                    type="number"
                    min={0} max={1} step={0.05}
                    value={draft.generationConfig?.top_p ?? ""}
                    onChange={(e) => updateGenConfig("top_p", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="0 ~ 1，留空用默认"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Tokens ({draft.generationConfig?.max_tokens ?? "默认"})</Label>
                  <Input
                    type="number"
                    min={1} max={128000} step={256}
                    value={draft.generationConfig?.max_tokens ?? ""}
                    onChange={(e) => updateGenConfig("max_tokens", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="最大输出 token 数"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Seed ({draft.generationConfig?.seed ?? "默认"})</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.generationConfig?.seed ?? ""}
                    onChange={(e) => updateGenConfig("seed", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="可复现采样种子"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Presence Penalty ({draft.generationConfig?.presence_penalty ?? "默认"})</Label>
                  <Input
                    type="number"
                    min={-2} max={2} step={0.1}
                    value={draft.generationConfig?.presence_penalty ?? ""}
                    onChange={(e) => updateGenConfig("presence_penalty", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="-2 ~ 2"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Frequency Penalty ({draft.generationConfig?.frequency_penalty ?? "默认"})</Label>
                  <Input
                    type="number"
                    min={-2} max={2} step={0.1}
                    value={draft.generationConfig?.frequency_penalty ?? ""}
                    onChange={(e) => updateGenConfig("frequency_penalty", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="-2 ~ 2"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs shrink-0">响应格式</Label>
                <select
                  value={draft.generationConfig?.response_format?.type ?? "text"}
                  onChange={(e) => updateGenConfig("response_format", e.target.value === "json_object" ? { type: "json_object" } : undefined)}
                  className="h-8 text-xs rounded-md border border-border/60 bg-input/60 px-2"
                >
                  <option value="text">纯文本（默认）</option>
                  <option value="json_object">JSON Mode</option>
                </select>
              </div>
              <p className="text-[11px] text-muted-foreground">
                这些参数控制 AI 生成行为，留空则使用模型默认值。并非所有提供商都支持全部参数。
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
          <Button type="button" variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-1.5" /> 导出模型
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" /> 导入模型
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              try {
                localStorage.removeItem(CACHE_KEY);
                localStorage.removeItem(MANUAL_KEY);
                localStorage.removeItem("ai_settings_v1");
                const fresh = loadSettings();
                setDraft(fresh);
                setTestModels(null);
                setProbeResults(null);
                onChange(fresh);
                toast.success("已恢复默认设置", {
                  description: fresh._isEnvKey && fresh.apiKey
                    ? "已使用环境变量中的初始 API 密钥"
                    : "环境变量中未配置初始密钥，请手动填写",
                });
              } catch (e: any) {
                toast.error("恢复失败", { description: e.message });
              }
            }}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" /> 恢复默认设置
         </Button>
           <Button type="button" variant="outline" size="sm" onClick={onClearCache} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1.5" /> 清空缓存并重置
            </Button>
        </div>
      </div>

      <Button onClick={onSave} variant="hero" size="lg" className="w-full">
        <Save className="mr-2 h-4 w-4" /> 保存设置
      </Button>
    </div>
  );
};

export default SettingsPanel;
