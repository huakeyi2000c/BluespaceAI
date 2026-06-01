const STORAGE_KEY = "ai_settings_v1";
const MODELS_CACHE_KEY = "ai_models_cache_v1";

/** 生成 UUID，兼容非 HTTPS 环境（crypto.randomUUID 需要 Secure Context） */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // fallback: crypto.getRandomValues 实现 v4 UUID
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)
  );
}

export interface GenerationConfig {
  temperature?: number;      // 0-2
  top_p?: number;            // 0-1
  max_tokens?: number;       // 最大生成 token
  presence_penalty?: number; // -2 到 2
  frequency_penalty?: number;// -2 到 2
  stop?: string[];           // 停止序列
  response_format?: { type: "json_object" | "text" }; // JSON Mode
  seed?: number;             // 可复现采样
}

export interface AISettings {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  imageModel: string;
  jailbreak?: string;
  generationConfig?: GenerationConfig;
  _isEnvKey?: boolean; // 标记 apiKey 是否来自环境变量
}

export const DEFAULT_SETTINGS: AISettings = {
  apiKey: "",
  baseUrl: "https://api.freetheai.xyz/v1",
  chatModel: "yng/gpt-5.5",
  imageModel: "vhr/gpt_image_2",
  jailbreak: "",
};

const ENV_API_KEY = import.meta.env.VITE_FALLBACK_API_KEY ?? "";

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    // 本地有 key 就用本地的，没有就用环境变量
    if (!saved.apiKey && ENV_API_KEY) {
      saved.apiKey = ENV_API_KEY;
      saved._isEnvKey = true; // 标记为环境变量来源
    }
    return saved;
  } catch {
    return { ...DEFAULT_SETTINGS, apiKey: ENV_API_KEY, _isEnvKey: !!ENV_API_KEY };
  }
}

export function saveSettings(s: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const PROXY_URL = "/api/public/ai-proxy";

/** 根据网关和 Key 格式构建认证头：自动识别 Azure/Anthropic/MiMo 等认证方式 */
function buildAuthHeaders(baseUrl: string, apiKey: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  // Anthropic 风格：x-api-key + anthropic-version
  if (/anthropic\.com/i.test(baseUrl)) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }
  // Azure OpenAI / MiMo 风格：api-key 头
  else if ((/xiaomimimo\.com|mimo-v2\.com/i.test(baseUrl) && /^tp-/i.test(apiKey)) || /\.openai\.azure\.com/i.test(baseUrl)) {
    headers["api-key"] = apiKey;
  }
  // 标准 OpenAI 兼容
  else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

// 走后端代理：把目标 URL / 方法 / headers / body 转给我们的服务端转发
async function fetchViaProxy(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers as HeadersInit);
    h.forEach((v, k) => { headers[k] = v; });
  }
  let body: string | undefined;
  if (init?.body != null && method !== "GET" && method !== "HEAD") {
    body = typeof init.body === "string" ? init.body : await new Response(init.body as BodyInit).text();
  }
  return fetch(PROXY_URL, {
    method: "POST",
    signal: init?.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method, headers, body }),
  });
}

// 429 自动重试封装；直连失败（CORS/网络）自动改走后端代理；支持超时控制
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, max = 2, timeoutMs?: number): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
  let attempt = 0;
  let useProxy = false;
  let triedBoth = false;

  // 超时控制：合并外部 signal 和超时 signal
  const createTimeoutSignal = (ms: number | undefined) => {
    if (!ms) return { signal: init?.signal, cleanup: () => {} };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    // 外部 signal 也监听
    if (init?.signal) {
      if (init.signal.aborted) { clearTimeout(timer); return { signal: init.signal, cleanup: () => {} }; }
      init.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    return {
      signal: ctrl.signal,
      cleanup: () => clearTimeout(timer),
    };
  };

  while (true) {
    let resp: Response;
    const { signal: timeoutSignal, cleanup } = createTimeoutSignal(timeoutMs);
    const mergedInit = { ...init, signal: timeoutSignal };
    try {
      resp = useProxy ? await fetchViaProxy(url, mergedInit) : await fetch(input, mergedInit);
    } catch (err) {
      cleanup();
      // 直连失败（CORS/网络）：切换到后端代理
      if (!useProxy) {
        useProxy = true;
        triedBoth = true;
        continue;
      }
      if (!triedBoth) {
        useProxy = !useProxy;
        triedBoth = true;
        continue;
      }
      throw err;
    }
    cleanup();
    // 代理不可用时回退直连；上游错误（400/500等）由调用方处理
    const ct = resp.headers.get("content-type") || "";
    const proxyDown = useProxy && (resp.status === 404 || resp.status === 502);
    const htmlResponse = ct.includes("text/html");
    if ((proxyDown || htmlResponse) && !triedBoth) {
      useProxy = !useProxy;
      triedBoth = true;
      continue;
    }
    if (resp.status !== 429 || attempt >= max) return resp;
    const ra = Number(resp.headers.get("retry-after"));
    const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, wait));
    attempt++;
  }
}

export type StreamResult = {
  finishReason?: string;  // "stop" | "length" | "content_filter" | "tool_calls" | ...
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  refusal?: string;       // 模型拒绝原因
};

export async function streamChat({
  settings,
  messages,
  onDelta,
  signal,
}: {
  settings: AISettings;
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  if (!settings.apiKey) throw new Error("请先在「设置」中填入 API 密钥");
  const headers = buildAuthHeaders(settings.baseUrl, settings.apiKey);
  if (!headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // 构建请求体：合并 GenerationConfig
  const genCfg = settings.generationConfig;
  const body: Record<string, any> = {
    model: settings.chatModel,
    messages,
    stream: true,
  };
  if (genCfg?.temperature !== undefined) body.temperature = genCfg.temperature;
  if (genCfg?.top_p !== undefined) body.top_p = genCfg.top_p;
  if (genCfg?.max_tokens !== undefined) body.max_tokens = genCfg.max_tokens;
  if (genCfg?.presence_penalty !== undefined) body.presence_penalty = genCfg.presence_penalty;
  if (genCfg?.frequency_penalty !== undefined) body.frequency_penalty = genCfg.frequency_penalty;
  if (genCfg?.stop && genCfg.stop.length > 0) body.stop = genCfg.stop;
  if (genCfg?.response_format) body.response_format = genCfg.response_format;
  if (genCfg?.seed !== undefined) body.seed = genCfg.seed;
  // 请求流式 usage（部分提供商支持）
  body.stream_options = { include_usage: true };

  const resp = await fetchWithRetry(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify(body),
  }, 2, 60_000); // 60s 超时

  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    throw new Error(`请求失败 (${resp.status}): ${t.slice(0, 200)}`);
  }

  const result: StreamResult = {};
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;
  let jsonReassemblyAttempts = 0;
  const MAX_REASSEMBLY = 3;

  while (!done) {
    const { value, done: d } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const parsed = JSON.parse(json);
        const choice = parsed.choices?.[0];

        // 提取内容
        const delta = choice?.delta?.content;
        if (delta) onDelta(delta);

        // 提取 finish_reason
        if (choice?.finish_reason) {
          result.finishReason = choice.finish_reason;
        }

        // 提取 refusal
        if (choice?.delta?.refusal) {
          result.refusal = choice.delta.refusal;
        }

        // 提取流中错误
        if (choice?.error) {
          throw new Error(choice.error.message || `流中错误: ${JSON.stringify(choice.error)}`);
        }

        // 提取 usage（最后一个 chunk 中包含）
        if (parsed.usage) {
          result.usage = {
            prompt_tokens: parsed.usage.prompt_tokens,
            completion_tokens: parsed.usage.completion_tokens,
            total_tokens: parsed.usage.total_tokens,
          };
        }

        jsonReassemblyAttempts = 0; // 解析成功，重置
      } catch (e) {
        // JSON 解析失败：可能是跨 chunk 分片，尝试重组
        if (e instanceof SyntaxError && jsonReassemblyAttempts < MAX_REASSEMBLY) {
          buf = line + "\n" + buf;
          jsonReassemblyAttempts++;
          break;
        }
        // 超过重组次数，跳过此行继续
        jsonReassemblyAttempts = 0;
        if (!(e instanceof SyntaxError)) throw e; // 非解析错误，向上抛出
      }
    }
  }
  return result;
}

export async function generateImage({
  settings,
  prompt,
  size = "1024x1024",
}: {
  settings: AISettings;
  prompt: string;
  size?: string;
}): Promise<string> {
  if (!settings.apiKey) throw new Error("请先在「设置」中填入 API 密钥");
  const base = settings.baseUrl.replace(/\/$/, "");

  const authHeaders = buildAuthHeaders(base, settings.apiKey);
  // 确保 JSON 请求有 Content-Type
  if (!authHeaders["Content-Type"]) {
    authHeaders["Content-Type"] = "application/json";
  }
  const postBody = { model: settings.imageModel, prompt, size, n: 1 };

  // ① POST /images/generations（标准端点）
  let resp = await fetchWithRetry(`${base}/images/generations`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(postBody),
  }, 2, 120_000); // 120s 超时（图像生成较慢）

  // ② 去掉 /v1 前缀重试
  const baseNoV = base.replace(/\/v\d+$/, "");
  if ((resp.status === 404 || resp.status === 400 || resp.status === 502) && base !== baseNoV) {
    resp = await fetchWithRetry(`${baseNoV}/images/generations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(postBody),
    });
  }

  // 检测 HTML 响应
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    throw new Error("图片生成失败：API 返回了网页而非图片数据，请检查 API 地址是否正确");
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    if (t.trim().startsWith("<!DOCTYPE") || t.trim().startsWith("<html")) {
      throw new Error("图片生成失败：请求被服务端防护拦截，请检查 API 地址是否正确");
    }
    let msg = `${resp.status}`;
    try {
      const j = JSON.parse(t);
      msg = j?.error?.message || j?.message || j?.detail || t.slice(0, 200);
    } catch { msg = t.slice(0, 200) || msg; }
    if (resp.status >= 500) {
      throw new Error(`图片生成失败：服务端错误（${resp.status}），模型可能暂时不可用，请稍后重试或换一个图片模型。详情：${msg}`);
    }
    throw new Error(`图片生成失败 (${resp.status}): ${msg}`);
  }

  let data: any;
  try {
    data = await resp.json();
  } catch {
    throw new Error("图片生成失败：响应格式异常，无法解析为 JSON");
  }
  const item = data?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error("响应中未找到图片数据");
}

/** dataUrl 转 Blob */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:([^;]+)/)?.[1] || "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function editImage({
  settings,
  prompt,
  imageDataUrl,
}: {
  settings: AISettings;
  prompt: string;
  imageDataUrl: string;
}): Promise<string> {
  if (!settings.apiKey) throw new Error("请先在「设置」中填入 API 密钥");
  const base = settings.baseUrl.replace(/\/$/, "");
  const matting = isMattingModel(settings.imageModel);

  // 构造 FormData
  const fd = new FormData();
  fd.append("model", settings.imageModel);
  if (matting) {
    // 抠图模型：/images/mattings，无 prompt，需 response_format
    fd.append("image", dataUrlToBlob(imageDataUrl), "image.png");
    fd.append("response_format", "b64_json");
  } else {
    // 普通编辑模型：/images/edits
    fd.append("image", dataUrlToBlob(imageDataUrl), "image.png");
    if (prompt) fd.append("prompt", prompt);
  }

  const endpoint = matting ? "/images/mattings" : "/images/edits";
  // 对于 FormData 请求，不设置 Content-Type，让浏览器自动设置
  const headers = buildAuthHeaders(base, settings.apiKey);
  delete headers["Content-Type"]; // 确保不设置 Content-Type
  const resp = await fetchWithRetry(`${base}${endpoint}`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`编辑失败 (${resp.status}): ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const item = data?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error("响应中未找到图片数据");
}

/** 从模型列表响应中提取模型 ID 列表（兼容多种返回格式） */
function extractModelIds(data: any): string[] {
  // 兼容多种格式：data.data / data.models / data.value (Azure) / 根数组
  const list: any[] = data?.data ?? data?.models ?? data?.value ?? (Array.isArray(data) ? data : []);
  const ids = list
    .map((m: any) => (typeof m === "string" ? m : m?.id ?? m?.name ?? m?.model))
    .filter((x: any): x is string => typeof x === "string" && x.length > 0);
  return Array.from(new Set(ids)).sort();
}

export async function fetchModels(settings: AISettings): Promise<string[]> {
  const base = settings.baseUrl.replace(/\/+$/, "");
  
  // 先尝试不带认证头（空 Key）
  try {
    const respNoAuth = await fetchWithRetry(`${base}/models`, {});
    if (respNoAuth.ok) {
      const data = await respNoAuth.json();
      const ids = extractModelIds(data);
      if (ids.length > 0) return ids;
    }
  } catch (e) {
    // 网络错误，继续尝试带认证头
  }
  
  // 再尝试带认证头（使用用户填写的 Key）
  const headers: Record<string, string> = buildAuthHeaders(base, settings.apiKey);
  if (!headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const respWithAuth = await fetchWithRetry(`${base}/models`, { headers });
  if (!respWithAuth.ok) {
    const t = await respWithAuth.text().catch(() => "");
    throw new Error(`获取模型失败 (${respWithAuth.status}): ${t.slice(0, 200)}`);
  }
  
  const data = await respWithAuth.json();
  return extractModelIds(data);
}

export function isMusicModel(id: string) {
  const s = id.toLowerCase();
  // 排除已知非音乐但含 music 关键词的对话模型
  if (/\bmusic[-_]?theory\b|\bmusic[-_]?quiz\b|\bmusic[-_]?edu\b/.test(s)) return false;
  return /(lyria|musicgen|suno|\budio\b|\bmusic\b|audio-?gen|sound-?gen|stable[-_]?audio|jukebox|riffusion|dance[-_]?diffusion|musiclm|acestep|elevenmusic)/.test(s);
}

export function isVideoModel(id: string) {
  const s = id.toLowerCase();
  return /(\bvideo\b|cogvideo|kling[-_]?(video|v\d)|\bkling\b(?!.*image)|runway|\bpika\b|luma[-_]?(video|dream|ray)|\bluma\b(?!.*image)|wanx|hailuo[-_]?(video|minimax)|\bhailuo\b(?!.*tts)|vidu|stable[-_]?video|\bsvd\b|animate[-_]?diff|runway[-_]?gen[-_]?[23]|\bgen[-_]?[23]\b|\bveo\b|\bltx\b|seedance|nova[-_]?reel|movie[-_]?gen|\bsora\b|hunyuan.*video|videocrafter|opensora|open[-_]?sora|pixverse|haiper|kaiber|deforum|mochi|step[-_]?video|skyreels|jimeng|ying[-_]?video)/.test(s);
}

export function isTtsModel(id: string) {
  const s = id.toLowerCase();
  return /(\btts\b|bark|fish[-_]?speech|cosyvoice|\bopenai[-_]?tts\b|chat[-_]?tts|edge[-_]?tts|xtts|vits|speech[-_]?t5|silero|piper|\baspire\b|f5[-_]?tts|gpt[-_]?sovits|melotts|melo[-_]?tts|bert[-_]?vits|kokoro|openvoice|mega[-_]?tts|natural[-_]?speech|voicebox|tortoise|dia[-_]?tts|elevenlabs|elevenflash|qwen[-_]?tts|hailuo[-_]?tts|mimo[-_]?v?2[-_.]?5?[-_]?tts)/.test(s);
}

/** 小米 MiMo TTS 模型，使用 /chat/completions + assistant 消息格式 */
export function isMimoTtsModel(id: string) {
  const s = id.toLowerCase();
  return /\bmimo[-_]?v?2[-_.]?5?[-_]?tts|mimo[-_]?tts/i.test(s);
}

/** MiMo TTS 内置播音员列表 */
export const MIMO_VOICES = [
  { label: "MiMo 默认", value: "mimo_default" },
  { label: "冰糖 (中文·女)", value: "冰糖" },
  { label: "茉莉 (中文·女)", value: "茉莉" },
  { label: "苏打 (中文·男)", value: "苏打" },
  { label: "白桦 (中文·男)", value: "白桦" },
  { label: "Mia (英文·女)", value: "Mia" },
  { label: "Chloe (英文·女)", value: "Chloe" },
  { label: "Milo (英文·男)", value: "Milo" },
  { label: "Dean (英文·男)", value: "Dean" },
] as const;

/** OpenAI 标准 TTS 声音列表 */
export const OPENAI_VOICES = [
  { label: "合金 ⚧", value: "alloy" },
  { label: "回声 ♂", value: "echo" },
  { label: "寓言 ⚧", value: "fable" },
  { label: "玛瑙 ♂", value: "onyx" },
  { label: "新星 ♀", value: "nova" },
  { label: "微光 ♀", value: "shimmer" },
] as const;

/** OpenAI 声音 → MiMo 声音映射（用于请求时自动转换） */
const OPENAI_TO_MIMO_VOICE: Record<string, string> = {
  alloy: "mimo_default",
  echo: "苏打",
  fable: "白桦",
  onyx: "Milo",
  nova: "冰糖",
  shimmer: "茉莉",
};

/** 语音转文字（STT / transcription）模型 */
export function isSttModel(id: string) {
  const s = id.toLowerCase();
  return /(\bwhisper\b|\bstt\b|transcri|speech[-_]?to[-_]?text|universal[-_]?[23]|deep[-_]?speech|wav2vec|parakeet|nemo[-_]?stt)/.test(s);
}

export function isMattingModel(id: string) {
  const s = id.toLowerCase();
  return /(\brmbg\b|remove[-_]?bg|background[-_]?remov|matting|segment[-_]?anything|\bsam\b)/.test(s);
}

export function isImageModel(id: string) {
  const s = id.toLowerCase();
  if (isMusicModel(s) || isVideoModel(s) || isTtsModel(s) || isSttModel(s)) return false;
  if (isMattingModel(s)) return true;
  if (s.startsWith("img/")) return true;
  // kling/luma 仅匹配图像变体（不含 video），视频变体由 isVideoModel 捕获
  const klingImage = /kling[-_]?(image|img|v\d[-_]?img)/.test(s) || (/\bkling\b/.test(s) && !/video/.test(s));
  const lumaImage = /luma[-_]?(image|img|photon)/.test(s) || (/\bluma\b/.test(s) && !/(video|dream|ray)/.test(s));
  if (klingImage || lumaImage) return true;
  return /(image|dall-?e|flux|stable-?diffusion|imagen|klein|kontext|nanobanana|hidream|nova-canvas|seedream|banana|midjourney|ideogram|cogview|recraft|playground|\bsd[-_/]|\bsdxl\b|pixart|deepfloyd|wuerstchen|kandinsky|ssd[-_]?1b|sana|aura[-_]?flow|playground[-_]?v|chroma|dall[-_]?3|gpt[-_]?image|turbo[-_]?diffusion|hyper[-_]?sd|juggernaut|dreamshaper|realistic[-_]?vision|cyberrealistic|epic[-_]?realism|absolutereality|deliberate|protogen|open[-_]?journey|anything[-_]?v|abyss[-_]?orange|meina|meinamix|counterfeit|camelliamix|pastel[-_]?mix|revanimated|ghostmix)/.test(s);
}

/** 任意媒体模型（图像/音乐/视频/TTS/STT/抠图） */
export function isMediaModel(id: string) {
  return isImageModel(id) || isMusicModel(id) || isVideoModel(id) || isTtsModel(id) || isSttModel(id) || isMattingModel(id);
}

/** 模型类型标签（用于 UI 显示） */
export type ModelKind = "对话" | "图像" | "音乐" | "视频" | "语音" | "转写" | "抠图" | "未知";
export function detectModelKind(id: string): ModelKind {
  if (isMattingModel(id)) return "抠图";
  if (isSttModel(id)) return "转写";
  if (isTtsModel(id)) return "语音";
  if (isMusicModel(id)) return "音乐";
  if (isVideoModel(id)) return "视频";
  if (isImageModel(id)) return "图像";
  // 常见对话模型关键词快速识别
  const s = id.toLowerCase();
  if (/(gpt|claude|gemini|llama|qwen|deepseek|chat|glm|mistral|yi-|phi-|command|grok|dbrx|falcon|starcoder|codestral|mixtral|internlm|baichuan|chatglm|moonshot|kimi|spark|ernie|aquila|internlm)/.test(s)) return "对话";
  // 无法识别 → 未知
  return "未知";
}

function extractAudioFromAny(obj: any): { url?: string; b64?: string; mime?: string } {
  // 深度递归搜索 audio 字段 / data URL / 音频 URL
  let result: { url?: string; b64?: string; mime?: string } = {};
  const seen = new WeakSet();
  const audioExt = /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)(\?|$)/i;
  const walk = (v: any) => {
    if (!v || result.url || result.b64) return;
    if (typeof v === "string") {
      const m = v.match(/data:(audio\/[\w+-]+);base64,([A-Za-z0-9+/=]+)/);
      if (m) { result = { b64: m[2], mime: m[1] }; return; }
      const urlMatch = v.match(/https?:\/\/\S+?\.(?:mp3|wav|ogg|m4a|flac|aac|opus|webm)(?:\?[^\s"'<>)]*)?/i);
      if (urlMatch) { result = { url: urlMatch[0], mime: "audio/" + (urlMatch[0].match(audioExt)?.[1] || "mpeg") }; return; }
      return;
    }
    if (typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    // 常见字段优先
    const direct = v.audio_url || v.url;
    if (typeof direct === "string" && (audioExt.test(direct) || /audio/i.test(v.mime_type || v.content_type || ""))) {
      result.url = direct;
      result.mime = v.mime_type || v.content_type || "audio/mpeg";
      return;
    }
    if (v.audio && typeof v.audio === "object") {
      if (typeof v.audio.data === "string") { result = { b64: v.audio.data, mime: "audio/" + (v.audio.format || "mpeg") }; return; }
      if (typeof v.audio.url === "string") { result = { url: v.audio.url, mime: v.audio.mime_type || "audio/mpeg" }; return; }
    }
    if (typeof v.b64_json === "string" && /audio/i.test(v.mime_type || v.content_type || "audio")) {
      result = { b64: v.b64_json, mime: v.mime_type || v.content_type || "audio/mpeg" };
      return;
    }
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(obj);
  return result;
}

export async function generateMusic({
  settings,
  prompt,
  model,
  imageDataUrl,
}: {
  settings: AISettings;
  prompt: string;
  model?: string;
  imageDataUrl?: string;
}): Promise<{ url: string; mime: string }> {
  if (!settings.apiKey) throw new Error("请先在「设置」中填入 API 密钥");
  const useModel = model || settings.imageModel;
  const base = settings.baseUrl.replace(/\/$/, "");
  const baseNoV = base.replace(/\/v\d+$/, "");

  const userContent: any = imageDataUrl
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]
    : prompt;

  const authHeaders = buildAuthHeaders(base, settings.apiKey, { "Content-Type": "application/json" });

  // 只对端点不存在类错误回退，参数错误不回退
  const shouldFallback = (r: Response) => r.status === 404 || r.status === 405 || isHtmlResponse(r);

  // ① POST /audio/music（标准端点，部分网关支持）
  let resp = await fetchWithRetry(`${base}/audio/music`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ model: useModel, prompt, n: 1, response_format: "mp3" }),
  });

  // ② POST baseNoV/audio/music（去掉 /v1 再试）
  if (shouldFallback(resp) && base !== baseNoV) {
    resp = await fetchWithRetry(`${baseNoV}/audio/music`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: useModel, prompt, n: 1, response_format: "mp3" }),
    });
  }

  // ③ POST /chat/completions（最终回退，Lyria 等模型走此路由）
  if (shouldFallback(resp)) {
    const musicBody: Record<string, any> = {
      model: useModel,
      messages: [{ role: "user", content: userContent }],
      audio: { format: "mp3" },
      n: 1,
    };
    // 仅当模型名暗示支持音频多模态时才发送 modalities
    if (/gpt-4o-audio|audio-preview|lyria/i.test(useModel)) {
      musicBody.modalities = ["audio", "text"];
    }
    resp = await fetchWithRetry(`${base}/chat/completions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(musicBody),
    });
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    let msg = `${resp.status}`;
    try {
      const j = JSON.parse(t);
      msg = j?.error?.message || j?.message || t.slice(0, 300);
    } catch { msg = t.slice(0, 300) || msg; }
    throw new Error(`音乐生成失败：${msg}`);
  }

  const ct = resp.headers.get("content-type") || "";
  if (ct.startsWith("audio/")) {
    const blob = await resp.blob();
    return { url: URL.createObjectURL(blob), mime: blob.type || "audio/mpeg" };
  }

  const data = await resp.json();
  const found = extractAudioFromAny(data);
  if (found.url) return { url: found.url, mime: found.mime || "audio/mpeg" };
  if (found.b64) return { url: `data:${found.mime || "audio/mpeg"};base64,${found.b64}`, mime: found.mime || "audio/mpeg" };

  // 没找到 — 把响应摘要抛给用户便于排查
  const preview = JSON.stringify(data).slice(0, 300);
  throw new Error(`未在响应中找到音频数据：${preview}`);
}

/** 从响应中递归提取视频 URL */
function extractVideoFromAny(obj: any): { url?: string; b64?: string; mime?: string } {
  let result: { url?: string; b64?: string; mime?: string } = {};
  const seen = new WeakSet();
  const videoExt = /\.(mp4|webm|mov|avi|mkv|gif)(\?|$)/i;
  const walk = (v: any) => {
    if (!v || result.url || result.b64) return;
    if (typeof v === "string") {
      const urlMatch = v.match(/https?:\/\/\S+?\.(?:mp4|webm|mov|avi|mkv|gif)(?:\?[^\s"'<>)]*)?/i);
      if (urlMatch) { result = { url: urlMatch[0], mime: "video/" + (urlMatch[0].match(videoExt)?.[1] || "mp4") }; return; }
      return;
    }
    if (typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (v.video_url) { result = { url: v.video_url, mime: v.mime_type || "video/mp4" }; return; }
    if (v.url && (videoExt.test(v.url) || /video/i.test(v.mime_type || v.content_type || ""))) {
      result = { url: v.url, mime: v.mime_type || v.content_type || "video/mp4" }; return;
    }
    if (typeof v.b64_json === "string" && /video/i.test(v.mime_type || v.content_type || "video")) {
      result = { b64: v.b64_json, mime: v.mime_type || v.content_type || "video/mp4" }; return;
    }
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(obj);
  return result;
}

/** 检测响应是否为 HTML 页面（Cloudflare 拦截等） */
function isHtmlResponse(r: Response): boolean {
  const ct = r.headers.get("content-type") || "";
  return ct.includes("text/html");
}

/** 判断是否需要回退到下一个端点（端点不存在 + 服务端错误；认证/参数错误不回退） */
const shouldFallback = (r: Response) =>
  r.status === 404 || r.status === 405 || r.status === 500 || r.status === 502 || r.status === 503 || isHtmlResponse(r);

/** 服务端错误时短暂等待再重试 */
const waitMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 从响应中提取可读错误信息（过滤 HTML 页面） */
async function extractError(resp: Response, prefix: string): Promise<never> {
  const t = await resp.text().catch(() => "");
  // 如果是 HTML 页面（Cloudflare 拦截等），给用户友好提示
  if (isHtmlResponse(resp) || t.trim().startsWith("<!DOCTYPE") || t.trim().startsWith("<html")) {
    throw new Error(`${prefix}：请求被服务端防护拦截（${resp.status}），请检查 API 地址是否正确，或稍后重试`);
  }
  let msg = `${resp.status}`;
  try {
    const j = JSON.parse(t);
    msg = j?.error?.message || j?.message || j?.detail || t.slice(0, 300);
  } catch { msg = t.slice(0, 300) || msg; }
  // 服务端错误给更明确的提示
  if (resp.status >= 500) {
    throw new Error(`${prefix}：服务端内部错误（${resp.status}），模型可能暂时不可用，请稍后重试或换一个视频模型。详情：${msg}`);
  }
  throw new Error(`${prefix}：${msg}`);
}

export async function generateVideo({
  settings,
  prompt,
  model,
  imageDataUrl,
  videoDataUrl,
  duration,
  aspectRatio,
}: {
  settings: AISettings;
  prompt: string;
  model?: string;
  imageDataUrl?: string;
  videoDataUrl?: string;
  duration?: number;
  aspectRatio?: string;
}): Promise<{ url: string; mime: string }> {
  if (!settings.apiKey) throw new Error("请先在「设置」中填入 API 密钥");
  const useModel = model || settings.imageModel;
  const base = settings.baseUrl.replace(/\/$/, "");
  const baseNoV = base.replace(/\/v\d+$/, "");
  const hasImage = !!(imageDataUrl || videoDataUrl);

  const userContent: any[] = [{ type: "text", text: prompt }];
  if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
  if (videoDataUrl) userContent.push({ type: "image_url", image_url: { url: videoDataUrl } });

  const authHeaders = buildAuthHeaders(base, settings.apiKey);

  let resp: Response;

  // ① POST /video/generations（标准端点，文生视频 & 图生视频都优先尝试）
  {
    const postBody: Record<string, any> = { model: useModel, prompt, n: 1 };
    if (duration) postBody.duration = duration;
    if (aspectRatio) postBody.aspect_ratio = aspectRatio;
    if (imageDataUrl) {
      postBody.image = imageDataUrl;
      postBody.image_url = imageDataUrl;
      postBody.input_image = imageDataUrl;
    }
    if (videoDataUrl) {
      postBody.video = videoDataUrl;
      postBody.video_url = videoDataUrl;
    }
    resp = await fetchWithRetry(`${base}/video/generations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(postBody),
    });
  }

  // ② POST /video/generations 去掉 /v1 前缀重试
  if (shouldFallback(resp) && base !== baseNoV) {
    await waitMs(800);
    const postBody: Record<string, any> = { model: useModel, prompt, n: 1 };
    if (duration) postBody.duration = duration;
    if (aspectRatio) postBody.aspect_ratio = aspectRatio;
    if (imageDataUrl) {
      postBody.image = imageDataUrl;
      postBody.image_url = imageDataUrl;
    }
    if (videoDataUrl) {
      postBody.video = videoDataUrl;
      postBody.video_url = videoDataUrl;
    }
    resp = await fetchWithRetry(`${baseNoV}/video/generations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(postBody),
    });
  }

  // ③ POST /video/generations（prompt 用多模态 content 数组）
  if (shouldFallback(resp)) {
    await waitMs(800);
    const postBody2: Record<string, any> = { model: useModel, prompt: userContent, n: 1 };
    if (duration) postBody2.duration = duration;
    if (aspectRatio) postBody2.aspect_ratio = aspectRatio;
    resp = await fetchWithRetry(`${base}/video/generations`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(postBody2),
    });
  }

  // ④ GET /video/{prompt}?model=xxx（REST 风格，如 Pollinations）
  if (!hasImage && shouldFallback(resp)) {
    await waitMs(500);
    const encoded = encodeURIComponent(prompt.trim());
    const params = new URLSearchParams({ model: useModel });
    if (duration) params.set("duration", String(duration));
    if (aspectRatio) params.set("aspectRatio", aspectRatio);
    const getUrl = `${baseNoV}/video/${encoded}?${params.toString()}`;
    const getHeaders: Record<string, string> = buildAuthHeaders(base, settings.apiKey);
    try {
      resp = await fetchWithRetry(getUrl, { headers: getHeaders });
    } catch {
      try { resp = await fetchViaProxy(getUrl, { headers: getHeaders }); } catch { /* 继续 */ }
    }
  }

  // ⑤ POST /chat/completions（最终回退，多模态消息格式）
  if (shouldFallback(resp)) {
    await waitMs(500);
    const chatBody: Record<string, any> = {
      model: useModel,
      messages: [{ role: "user", content: hasImage ? userContent : prompt }],
      modalities: ["video", "text"],
      n: 1,
    };
    if (duration) chatBody.duration = duration;
    if (aspectRatio) chatBody.aspect_ratio = aspectRatio;
    resp = await fetchWithRetry(`${base}/chat/completions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(chatBody),
    });
  }

  if (!resp.ok || isHtmlResponse(resp)) {
    await extractError(resp, "视频生成失败");
  }

  const ct = resp.headers.get("content-type") || "";
  if (ct.startsWith("video/")) {
    const blob = await resp.blob();
    return { url: URL.createObjectURL(blob), mime: blob.type || "video/mp4" };
  }

  // 响应是 HTML 但 status 200（部分网关返回 200 + HTML 拦截页）
  if (ct.includes("text/html")) {
    throw new Error("视频生成失败：API 返回了网页而非视频数据，请检查 API 地址是否正确");
  }

  let data: any;
  try {
    data = await resp.json();
  } catch {
    throw new Error("视频生成失败：响应格式异常，无法解析为 JSON");
  }
  const found = extractVideoFromAny(data);
  if (found.url) return { url: found.url, mime: found.mime || "video/mp4" };
  if (found.b64) return { url: `data:${found.mime || "video/mp4"};base64,${found.b64}`, mime: found.mime || "video/mp4" };

  const preview = JSON.stringify(data).slice(0, 300);
  throw new Error(`未在响应中找到视频数据：${preview}`);
}

export async function generateTts({
  settings,
  prompt,
  model,
  voice,
}: {
  settings: AISettings;
  prompt: string;
  model?: string;
  voice?: string;
}): Promise<{ url: string; mime: string }> {
  if (!settings.apiKey) throw new Error("请先在「设置」中填入 API 密钥");
  const useModel = model || settings.imageModel;
  const base = settings.baseUrl.replace(/\/$/, "");
  const baseNoV = base.replace(/\/v\d+$/, "");
  const useVoice = voice || "alloy";
  // 是否为小米 MiMo 官方网关
  const isMimoGw = /xiaomimimo\.com|mimo-v2\.com/i.test(base);

  // 只对端点不存在类错误回退，认证/参数错误不回退（换了端点也不会好）
  const shouldFallback = (r: Response) =>
    r.status === 404 || r.status === 405 || isHtmlResponse(r);

  const TTS_TIMEOUT = 120_000; // TTS 超时 120s
  let resp: Response;

  // ★ MiMo 官方网关 + MiMo TTS 模型：直接走 /chat/completions（和 003 版一致）
  //    MiMo 网关不支持 /audio/speech，先走其他端点只会触发服务端防护拦截
  if (isMimoGw && isMimoTtsModel(useModel)) {
    // MiMo 网关：使用 buildAuthHeaders 自动选择认证方式
    const mimoHeaders = buildAuthHeaders(base, settings.apiKey, { "Content-Type": "application/json" });
    resp = await fetchWithRetry(`${base}/chat/completions`, {
      method: "POST",
      headers: mimoHeaders,
      body: JSON.stringify({
        model: useModel,
        messages: [
          { role: "user", content: "" },
          { role: "assistant", content: prompt },
        ],
        audio: { format: "wav", voice: OPENAI_TO_MIMO_VOICE[useVoice] || useVoice },
        stream: false,
      }),
    }, 2, TTS_TIMEOUT);
  } else {
    // 非 MiMo 场景：标准 OpenAI 回退链
    const authHeaders = buildAuthHeaders(base, settings.apiKey, { "Content-Type": "application/json" });

    // ① POST /audio/speech（标准 OpenAI 风格）
    resp = await fetchWithRetry(`${base}/audio/speech`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: useModel, input: prompt, voice: useVoice, response_format: "mp3" }),
    }, 2, TTS_TIMEOUT);

    // ② 去掉 /v1 再试 /audio/speech
    if (shouldFallback(resp) && base !== baseNoV) {
      resp = await fetchWithRetry(`${baseNoV}/audio/speech`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ model: useModel, input: prompt, voice: useVoice, response_format: "mp3" }),
      }, 2, TTS_TIMEOUT);
    }

    // ③ POST /chat/completions（多模态 TTS 回退，兼容 GPT-4o-audio 和 MiMo 非官方网关）
    if (shouldFallback(resp)) {
      // 兼容构建：部分 API 不支持 modalities 字段，仅当模型名暗示支持时才发送
      const body: Record<string, any> = {
        model: useModel,
        messages: [{ role: "user", content: prompt }],
        audio: { format: "mp3", voice: useVoice },
        n: 1,
      };
      // GPT-4o-audio 等模型需要 modalities 字段
      if (/gpt-4o-audio|gpt-4o-mini-audio|audio-preview/i.test(useModel)) {
        body.modalities = ["audio", "text"];
      }
      // MiMo 非官方网关：使用 assistant 消息格式
      if (isMimoTtsModel(useModel)) {
        body.messages = [
          { role: "user", content: "" },
          { role: "assistant", content: prompt },
        ];
        body.audio = { format: "wav", voice: OPENAI_TO_MIMO_VOICE[useVoice] || useVoice };
        body.stream = false;
        delete body.n;
      }
      resp = await fetchWithRetry(`${base}/chat/completions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      }, 2, TTS_TIMEOUT);
    }
  }

  if (!resp.ok || isHtmlResponse(resp)) {
    await extractError(resp, "语音生成失败");
  }

  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    throw new Error("语音生成失败：API 返回了网页而非音频数据，请检查 API 地址是否正确");
  }
  if (ct.startsWith("audio/")) {
    const blob = await resp.blob();
    return { url: URL.createObjectURL(blob), mime: blob.type || "audio/mpeg" };
  }

  let data: any;
  try {
    data = await resp.json();
  } catch {
    throw new Error("语音生成失败：响应格式异常，无法解析为 JSON");
  }

  // MiMo TTS 响应格式：choices[0].message.audio.data (base64)
  const audioData = data?.choices?.[0]?.message?.audio?.data;
  if (typeof audioData === "string") {
    const format = data?.choices?.[0]?.message?.audio?.format || "wav";
    const mime = format === "mp3" ? "audio/mpeg" : format === "pcm16" ? "audio/pcm" : "audio/wav";
    return { url: `data:${mime};base64,${audioData}`, mime };
  }

  const found = extractAudioFromAny(data);
  if (found.url) return { url: found.url, mime: found.mime || "audio/mpeg" };
  if (found.b64) return { url: `data:${found.mime || "audio/mpeg"};base64,${found.b64}`, mime: found.mime || "audio/mpeg" };

  const preview = JSON.stringify(data).slice(0, 300);
  throw new Error(`未在响应中找到语音数据：${preview}`);
}

/** 语音转文字（STT） */
export async function generateStt({
  settings,
  audioDataUrl,
  model,
}: {
  settings: AISettings;
  audioDataUrl: string;
  model?: string;
}): Promise<string> {
  if (!settings.apiKey) throw new Error("请先在「设置」中填入 API 密钥");
  const useModel = model || settings.imageModel;
  const base = settings.baseUrl.replace(/\/$/, "");
  const baseNoV = base.replace(/\/v\d+$/, "");

  // dataUrl → Blob
  const [meta, b64] = audioDataUrl.split(",");
  const mime = meta.match(/:([^;]+)/)?.[1] || "audio/mpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const audioBlob = new Blob([arr], { type: mime });

  // 只对端点不存在类错误回退，参数错误不回退
  const shouldFallback = (r: Response) => r.status === 404 || r.status === 405 || isHtmlResponse(r);
  // FormData 请求不设 Content-Type，让浏览器自动设置
  const sttHeaders = buildAuthHeaders(base, settings.apiKey);
  delete sttHeaders["Content-Type"];

  // ① POST /audio/transcriptions（标准 OpenAI Whisper 风格）
  const fd = new FormData();
  fd.append("file", audioBlob, "audio.mp3");
  fd.append("model", useModel);
  fd.append("response_format", "json");
  let resp = await fetchWithRetry(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: sttHeaders,
    body: fd,
  });

  // ② POST baseNoV/audio/transcriptions（去掉 /v1 再试）
  if (shouldFallback(resp) && base !== baseNoV) {
    const fd2 = new FormData();
    fd2.append("file", audioBlob, "audio.mp3");
    fd2.append("model", useModel);
    fd2.append("response_format", "json");
    resp = await fetchWithRetry(`${baseNoV}/audio/transcriptions`, {
      method: "POST",
      headers: sttHeaders,
      body: fd2,
    });
  }

  // ③ POST /chat/completions（最终回退：把音频当附件发送）
  if (shouldFallback(resp)) {
    const chatHeaders = buildAuthHeaders(base, settings.apiKey, { "Content-Type": "application/json" });
    resp = await fetchWithRetry(`${base}/chat/completions`, {
      method: "POST",
      headers: chatHeaders,
      body: JSON.stringify({
        model: useModel,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "请将以下音频内容转写为文字，只输出转写结果：" },
            { type: "image_url", image_url: { url: audioDataUrl } },
          ],
        }],
      }),
    });
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    let msg = `${resp.status}`;
    try {
      const j = JSON.parse(t);
      msg = j?.error?.message || j?.message || t.slice(0, 300);
    } catch { msg = t.slice(0, 300) || msg; }
    throw new Error(`语音转写失败：${msg}`);
  }

  const ct = resp.headers.get("content-type") || "";
  if (ct.startsWith("text/plain")) {
    return (await resp.text()).trim();
  }

  const data = await resp.json();
  // OpenAI 标准响应: { text: "..." }
  if (typeof data.text === "string" && data.text.trim()) return data.text.trim();
  // 可能嵌套在 choices 里
  const choice = data?.choices?.[0];
  if (choice?.message?.content) return choice.message.content.trim();
  if (choice?.text) return choice.text.trim();
  // 深度搜索
  const walk = (v: any): string | null => {
    if (!v) return null;
    if (typeof v === "string" && v.length > 5) return v;
    if (typeof v !== "object") return null;
    for (const k of Object.keys(v)) {
      const r = walk(v[k]);
      if (r) return r;
    }
    return null;
  };
  const found = walk(data);
  if (found) return found.trim();

  const preview = JSON.stringify(data).slice(0, 300);
  throw new Error(`未在响应中找到转写文本：${preview}`);
}

// 探测某个模型是否可用：根据模型类型选择对应端点探测
export async function probeModel(settings: AISettings, modelId: string): Promise<{ ok: boolean; status?: number; message?: string }> {
  if (!settings.apiKey) return { ok: false, message: "缺少 API 密钥" };
  const base = settings.baseUrl.replace(/\/$/, "");
  const authHeaders = buildAuthHeaders(base, settings.apiKey, { "Content-Type": "application/json" });

  // 根据模型类型选择探测端点
  const kind = detectModelKind(modelId);
  try {
    let resp: Response;

    if (kind === "图像" || kind === "抠图") {
      // 图像/抠图模型：尝试 /images/generations（最小请求）
      resp = await fetchWithRetry(`${base}/images/generations`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ model: modelId, prompt: "test", n: 1, size: "256x256" }),
      }, 1);
      // 若 images 端点不支持，回退到 chat/completions
      if (resp.status === 404 || resp.status === 405) {
        resp = await fetchWithRetry(`${base}/chat/completions`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "ping" }], max_tokens: 2, stream: false }),
        });
      }
    } else if (kind === "语音") {
      // TTS 模型：尝试 /audio/speech
      resp = await fetchWithRetry(`${base}/audio/speech`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ model: modelId, input: "test", voice: "alloy", response_format: "mp3" }),
      }, 1);
      if (resp.status === 404 || resp.status === 405) {
        resp = await fetchWithRetry(`${base}/chat/completions`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "ping" }], max_tokens: 2, stream: false }),
        });
      }
    } else if (kind === "转写") {
      // STT 模型无法简单探测（需音频文件），回退到 chat/completions
      resp = await fetchWithRetry(`${base}/chat/completions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "ping" }], max_tokens: 2, stream: false }),
      });
    } else if (kind === "音乐" || kind === "视频") {
      // 音乐/视频模型：先尝试专用端点，再回退 chat
      const endpoint = kind === "音乐" ? "/audio/music" : "/video/generations";
      resp = await fetchWithRetry(`${base}${endpoint}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ model: modelId, prompt: "test", n: 1 }),
      }, 1);
      if (resp.status === 404 || resp.status === 405) {
        resp = await fetchWithRetry(`${base}/chat/completions`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "ping" }], max_tokens: 2, stream: false }),
        });
      }
    } else {
      // 对话/未知模型：标准 chat/completions 探测
      resp = await fetchWithRetry(`${base}/chat/completions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "ping" }], max_tokens: 2, stream: false }),
      });
    }

    if (resp.ok) return { ok: true, status: resp.status };
    const t = await resp.text().catch(() => "");
    let msg = `${resp.status}`;
    try {
      const j = JSON.parse(t);
      msg = j?.error?.message || j?.message || msg;
    } catch { msg = t.slice(0, 160) || msg; }
    return { ok: false, status: resp.status, message: msg };
  } catch (e: any) {
    return { ok: false, message: e?.message || "网络错误" };
  }
}

const MANUAL_KEY = "ai_models_manual_v1";

export function getManualModels(baseUrl: string): string[] {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw);
    return Array.isArray(map[baseUrl]) ? map[baseUrl] : [];
  } catch {
    return [];
  }
}

export function getCachedModels(baseUrl: string): string[] {
  try {
    const raw = localStorage.getItem(MODELS_CACHE_KEY);
    if (!raw) return [];
    const c = JSON.parse(raw);
    return c?.baseUrl === baseUrl && Array.isArray(c?.models) ? c.models : [];
  } catch {
    return [];
  }
}

/** 获取所有可用模型（API 缓存 + 手动添加），用于校验 */
export function getAllModels(baseUrl: string): string[] {
  const cached = getCachedModels(baseUrl);
  const manual = getManualModels(baseUrl);
  return Array.from(new Set([...cached, ...manual]));
}

export type ModelCheck =
  | { ok: true }
  | { ok: false; reason: "no-models" | "not-found" | "wrong-type"; suggestion?: string; message: string };

export function validateModel(
  modelId: string,
  available: string[],
  kind: "chat" | "image"
): ModelCheck {
  if (!available || available.length === 0) {
    return { ok: false, reason: "no-models", message: "尚未加载模型列表，请先在选择器中刷新" };
  }
  const want = kind === "image" ? isMediaModel : (id: string) => !isMediaModel(id);
  const exists = available.includes(modelId);
  if (!exists) {
    const suggestion = available.find(want);
    return {
      ok: false,
      reason: "not-found",
      suggestion,
      message: `模型「${modelId}」在当前服务中不存在`,
    };
  }
  const typeOk = want(modelId);
  if (!typeOk) {
    const suggestion = available.find(want);
    return {
      ok: false,
      reason: "wrong-type",
      suggestion,
      message: kind === "image"
        ? `「${modelId}」不是媒体模型`
        : `「${modelId}」是媒体模型，无法用于对话`,
    };
  }
  return { ok: true };
}
