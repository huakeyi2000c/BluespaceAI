import { useState, useRef, useEffect, useCallback } from "react";
import { Wand2, Download, Loader2, ImageIcon, Sparkles, Upload, Edit3, X, Music, Video, Mic, FileAudio, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AISettings, fetchModels, generateImage, generateMusic, generateVideo, generateTts, generateStt, editImage, getAllModels, isImageModel, isMusicModel, isVideoModel, isTtsModel, isSttModel, isMediaModel, isMattingModel, detectModelKind, saveSettings, validateModel, uuid, isMimoTtsModel, MIMO_VOICES, OPENAI_VOICES } from "@/lib/aiClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ModelPicker from "./ModelPicker";
import TextareaToolbar from "./TextareaToolbar";
import DiffusionLoader from "./DiffusionLoader";

interface Props { settings: AISettings; onSettingsChange?: (s: AISettings) => void }

const SIZES = [
  { label: "方形 1:1", value: "1024x1024" },
  { label: "竖图 9:16", value: "1024x1792" },
  { label: "横图 16:9", value: "1792x1024" },
];

const MORE_SIZES = [
  { label: "方形 512", value: "512x512" },
  { label: "方形 2048", value: "2048x2048" },
  { label: "横图 3:2", value: "1536x1024" },
  { label: "横图 2:1", value: "2048x1024" },
  { label: "竖图 2:3", value: "1024x1536" },
  { label: "竖图 1:2", value: "1024x2048" },
  { label: "横图 4:3", value: "1366x1024" },
  { label: "竖图 3:4", value: "1024x1366" },
];

const PRESETS = [
   "变形金刚现代机甲动画概念，极具工业美感的金属机械视觉符号，极其精密的液压连杆、齿轮咬合与外露机械零件细节，带有划痕与做旧质感的金属漆面与高反射电镀层概念，标志性的能量块(Energon)蓝色或红色发光核心与赛博坦文字细节，动态的零件展开与重构变形过程视觉符号，威严的领袖姿态与充满力量感的钢铁构架，充满科技感的赛博坦城市地景或战火硝烟的科幻背景，强烈的电影级丁达尔光效与电火花喷溅细节，宏大、热血、硬核且充满力量张力的机械氛围概念，顶级好莱坞CG动画与超写实机甲原画品质，美丽东方女子身穿深紫色紧身战术服站在“曙光号”殖民舰观景甲板，晨光透过强化玻璃洒在她湿发与金属肩甲上，指尖轻触悬浮的全息星图，背景是浩瀚星云与旋转陨石带，战舰结构充满机械装甲与能量管线，整体呈现机甲巅峰变形金刚动画风格的厚重机械质感与冷峻未来感，符合星际争霸时代的科技设定，",
  "动漫插画，护士角色设计，单人构图，温柔表情，大而有神的眼睛，柔和微笑，干净整洁的白色护士制服，现代医疗连衣裙设计，贴合但得体剪裁，白色护士帽带红十字标志，整齐短发或长发，柔和浅色发色，明亮清澈眼眸，手持医疗夹板或注射器（无威胁感），脖子佩戴听诊器，白色长袜，舒适护士鞋，柔和光线，医院室内背景，环境干净整洁，粉蓝白色调为主，淡粉色点缀，顺滑赛璐珞上色，精细线稿，温暖治愈氛围，柔和渐变背景，角色主体突出，制服褶皱细节清晰，精致日系动漫风格，专业又可爱的视觉气质，",
  "人体彩绘艺术,东方美学花卉图案,牡丹莲花梅花缠绕女性躯体,水墨晕染效果,淡雅粉白渐变,肌肤若隐若现,花瓣从肩胛蔓延至腰臀,背部蝴蝶纹样,柔光打在曲线之上,艺术摄影质感,高雅含蓄东方韵味,杰作级画质,",
  "杰作, 极致细节, 女孩, 独自, 慵懒姿态概念,电影级光影视觉符号, 体积光效果, 完美眼睛细节, 纤细手指视觉符号, 动漫上色风格, 梦幻空灵氛围, 自然阴影, 金色长发视觉符号, 侧边双马尾造型, 红色发带, 红色眼睛, 吊眼梢特征, 嘴部微启, 白色领口视觉符号, 无袖衬衫, 条纹背心, 交叉系带设计, 拉链细节, 黑色颈圈, 黑色护腕, 赤脚视觉符号, 户外码头场景概念, 湖泊景观, 蓝天白云, 白鸟视觉符号, 码头端坐姿态视觉符号, 手臂支撑概念, 足尖触水概念, 侧面视角构图, 俯视视角构图, 微笑表情视觉符号, 折射光影效果, 棱镜光效, 斑驳阳光视觉符号,",
];

const ImagePanel = ({ settings, onSettingsChange }: Props) => {
  const STATE_KEY = "ai_image_state_v1";
  const persisted = (() => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); } catch { return {}; }
  })();
  const [tab, setTab] = useState<"generate" | "edit">(persisted.tab ?? "generate");
  const [prompt, setPrompt] = useState<string>(persisted.prompt ?? "");
  const [size, setSize] = useState<string>(persisted.size ?? SIZES[0].value);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(persisted.imageUrl ?? null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMime, setAudioMime] = useState<string>("audio/mpeg");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string>("video/mp4");
  const [videoDuration, setVideoDuration] = useState<number>(4);
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>("16:9");
  const [ttsVoice, setTtsVoice] = useState<string>("alloy");

  // 切换 TTS 模型类型时自动重置播音员
  useEffect(() => {
    setTtsVoice(isMimoTtsModel(settings.imageModel) ? "mimo_default" : "alloy");
  }, [isMimoTtsModel(settings.imageModel)]);

  // 语音转文字
  const [sttAudioDataUrl, setSttAudioDataUrl] = useState<string | null>(null);
  const [sttResult, setSttResult] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  /** 根据语气标点自动断句分段 */
  const formatSttText = useCallback((raw: string): string => {
    // 去掉多余空白
    let t = raw.replace(/\s+/g, " ").trim();
    // 每遇到句末标点后换行分段（。！？!?；;…）
    t = t.replace(/([。！？!?；;…]+)\s*/g, "$1\n\n");
    // 英文句号后跟大写字母或空白结束也分段
    t = t.replace(/(\.)\s+(?=[A-Z])/g, "$1\n\n");
    // 清理多余空行
    t = t.replace(/\n{3,}/g, "\n\n").trim();
    return t;
  }, []);

  // 录音
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 编辑模式
  const [editPrompt, setEditPrompt] = useState<string>(persisted.editPrompt ?? "");
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; dataUrl: string; type: "image" | "video" }>>(persisted.uploadedImages ?? []);
  const [editLoading, setEditLoading] = useState(false);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(persisted.editedImageUrl ?? null);
  const [editedAudioUrl, setEditedAudioUrl] = useState<string | null>(null);
  const [editedAudioMime, setEditedAudioMime] = useState<string>("audio/mpeg");
  const [editedVideoUrl, setEditedVideoUrl] = useState<string | null>(null);
  const [editedVideoMime, setEditedVideoMime] = useState<string>("video/mp4");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const editPromptRef = useRef<HTMLTextAreaElement>(null);

  const isMusic = isMusicModel(settings.imageModel || "");
  const isVideo = isVideoModel(settings.imageModel || "");
  const isTts = isTtsModel(settings.imageModel || "");
  const isStt = isSttModel(settings.imageModel || "");
  const isMatting = isMattingModel(settings.imageModel || "");
  const kind = detectModelKind(settings.imageModel || "");

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        tab, prompt, size, imageUrl, editPrompt, uploadedImages, editedImageUrl,
      }));
    } catch {}
  }, [tab, prompt, size, imageUrl, editPrompt, uploadedImages, editedImageUrl]);

  const onGenerate = async () => {
    if (!settings.apiKey) {
      toast.error("请先在「设置」中填入 API 密钥");
      return;
    }
    if (isSttModel(settings.imageModel) && !sttAudioDataUrl) {
      toast.error("请先上传音频文件");
      return;
    }
    if (!isSttModel(settings.imageModel) && !prompt.trim()) return;
    setLoading(true);
    setImageUrl(null);
    setAudioUrl(null);
    setVideoUrl(null);
    setSttResult(null);
    try {
      if (isVideoModel(settings.imageModel)) {
        const { url, mime } = await generateVideo({ settings, prompt: prompt.trim(), duration: videoDuration, aspectRatio: videoAspectRatio });
        setVideoUrl(url);
        setVideoMime(mime);
        toast.success("视频生成成功");
      } else if (isSttModel(settings.imageModel)) {
        const text = await generateStt({ settings, audioDataUrl: sttAudioDataUrl! });
        setSttResult(formatSttText(text));
        toast.success("转写成功");
      } else if (isTtsModel(settings.imageModel)) {
        const { url, mime } = await generateTts({ settings, prompt: prompt.trim(), voice: ttsVoice });
        setAudioUrl(url);
        setAudioMime(mime);
        toast.success("语音生成成功");
      } else if (isMusicModel(settings.imageModel)) {
        const { url, mime } = await generateMusic({ settings, prompt: prompt.trim() });
        setAudioUrl(url);
        setAudioMime(mime);
        toast.success("音乐生成成功");
      } else {
        const url = await generateImage({ settings, prompt: prompt.trim(), size });
        setImageUrl(url);
        toast.success("生成成功");
      }
    } catch (e: any) {
      toast.error("生成失败", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const onDownload = async () => {
    if (!imageUrl) return;
    try {
      const r = await fetch(imageUrl);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ai-image-${Date.now()}.png`;
      a.click();
    } catch {
      window.open(imageUrl, "_blank");
    }
  };

  const downloadAudio = async (url: string, mime: string, name: string) => {
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "mp3";
      a.download = `${name}-${Date.now()}.${ext}`;
      a.click();
    } catch {
      window.open(url, "_blank");
    }
  };

  const downloadVideo = async (url: string, mime: string, name: string) => {
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = mime.includes("webm") ? "webm" : mime.includes("mov") ? "mov" : "mp4";
      a.download = `${name}-${Date.now()}.${ext}`;
      a.click();
    } catch {
      window.open(url, "_blank");
    }
  };

  const onUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideoFile = file.type.startsWith("video/");
      const maxSize = isVideoFile ? 50 * 1024 * 1024 : 8 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(`${file.name} 超过 ${isVideoFile ? "50" : "8"}MB`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedImages((prev) => [
          ...prev,
          { id: uuid(), dataUrl: ev.target?.result as string, type: isVideoFile ? "video" : "image" },
        ]);
      };
      reader.readAsDataURL(file);
    }
    setEditedImageUrl(null);
    e.target.value = "";
  };

  const removeImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const onEdit = async () => {
    const matting = isMattingModel(settings.imageModel);
    const stt = isSttModel(settings.imageModel);
    if (stt && !sttAudioDataUrl) { toast.error("请先上传音频文件"); return; }
    if (!stt && (!editPrompt.trim() && !matting) || (!stt && !isTtsModel(settings.imageModel) && uploadedImages.length === 0)) return;
    if (!settings.apiKey) {
      toast.error("请先在「设置」中填入 API 密钥");
      return;
    }
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
      const check = validateModel(settings.imageModel, available, "image");
      if (check.ok !== true) {
        const { message, suggestion } = check;
        if (suggestion) {
          toast.error(message, {
            description: `建议替换为：${suggestion}`,
            action: {
              label: "使用建议",
              onClick: () => {
                const next = { ...settings, imageModel: suggestion };
                saveSettings(next);
                onSettingsChange?.(next);
                toast.success(`已切换到 ${suggestion}`);
              },
            },
          });
        } else {
          toast.error(message, { description: "请在上方选择器中选择图像模型" });
        }
        return;
      }
    }
    setEditLoading(true);
    setEditedImageUrl(null);
    setEditedAudioUrl(null);
    setEditedVideoUrl(null);
    setSttResult(null);
    try {
      if (isSttModel(settings.imageModel)) {
        const text = await generateStt({ settings, audioDataUrl: sttAudioDataUrl! });
        setSttResult(formatSttText(text));
        toast.success("转写成功");
      } else if (isVideoModel(settings.imageModel)) {
        const firstFile = uploadedImages[0];
        const { url, mime } = await generateVideo({
          settings,
          prompt: editPrompt.trim(),
          imageDataUrl: firstFile.type === "image" ? firstFile.dataUrl : undefined,
          videoDataUrl: firstFile.type === "video" ? firstFile.dataUrl : undefined,
          duration: videoDuration,
          aspectRatio: videoAspectRatio,
        });
        setEditedVideoUrl(url);
        setEditedVideoMime(mime);
        toast.success("视频生成成功");
      } else if (isTtsModel(settings.imageModel)) {
        const { url, mime } = await generateTts({
          settings,
          prompt: editPrompt.trim(),
          voice: ttsVoice,
        });
        setEditedAudioUrl(url);
        setEditedAudioMime(mime);
        toast.success("语音生成成功");
      } else if (isMusicModel(settings.imageModel)) {
        // 图生音乐
        const { url, mime } = await generateMusic({
          settings,
          prompt: editPrompt.trim(),
          imageDataUrl: uploadedImages[0].dataUrl,
        });
        setEditedAudioUrl(url);
        setEditedAudioMime(mime);
        toast.success("音乐生成成功");
      } else {
        const url = await editImage({
          settings,
          prompt: editPrompt.trim(),
          imageDataUrl: uploadedImages[0].dataUrl,
        });
        setEditedImageUrl(url);
        toast.success("编辑成功");
      }
    } catch (e: any) {
      toast.error("生成失败", { description: e.message });
    } finally {
      setEditLoading(false);
    }
  };

  const onDownloadEdited = async () => {
    if (!editedImageUrl) return;
    try {
      const r = await fetch(editedImageUrl);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ai-edited-${Date.now()}.png`;
      a.click();
    } catch {
      window.open(editedImageUrl, "_blank");
    }
  };

  /** 从视频文件中提取音频轨，返回 audio dataUrl */
  const extractAudioFromVideo = useCallback(async (file: File): Promise<string> => {
    const arrayBuf = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      // 转为 WAV
      const numCh = audioBuffer.numberOfChannels;
      const sr = audioBuffer.sampleRate;
      const len = audioBuffer.length;
      const wavBuf = audioCtx.createBuffer(1, len, sr);
      // 取前两个声道混音为单声道
      const ch0 = audioBuffer.getChannelData(0);
      const out = wavBuf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        if (numCh >= 2) {
          const ch1 = audioBuffer.getChannelData(1);
          out[i] = (ch0[i] + ch1[i]) / 2;
        } else {
          out[i] = ch0[i];
        }
      }
      // 编码 WAV
      const wavData = encodeWav(out, sr);
      const blob = new Blob([wavData], { type: "audio/wav" });
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } finally {
      await audioCtx.close();
    }
  }, []);

  /** PCM Float32 → WAV ArrayBuffer */
  const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const bufLen = 44 + samples.length * 2;
    const buf = new ArrayBuffer(bufLen);
    const v = new DataView(buf);
    const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, "RIFF");
    v.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); // PCM
    v.setUint16(22, 1, true); // mono
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    writeStr(36, "data");
    v.setUint32(40, samples.length * 2, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buf;
  };

  /** 开始录音 */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recordChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        const blob = new Blob(recordChunksRef.current, { type: "audio/webm" });
        const r = new FileReader();
        r.onload = (ev) => {
          setSttAudioDataUrl(ev.target?.result as string);
          setSttResult(null);
        };
        r.readAsDataURL(blob);
        setIsRecording(false);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => setRecordDuration(d => d + 1), 1000);
    } catch {
      toast.error("无法访问麦克风，请检查浏览器权限");
    }
  }, []);

  /** 停止录音 */
  const stopRecording = useCallback(() => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    mediaRecorderRef.current?.stop();
  }, []);

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5">
      <div className="glass rounded-2xl p-6 space-y-5">
        {/* Tab 切换 */}
        <div className="flex gap-2 border-b border-border/60">
          <button
            onClick={() => setTab("generate")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2",
              tab === "generate"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="inline mr-2 h-4 w-4" />
            文生图
          </button>
          <button
            onClick={() => setTab("edit")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2",
              tab === "edit"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Edit3 className="inline mr-2 h-4 w-4" />
            图像编辑
          </button>
        </div>

        {/* 文生图面板 */}
        {tab === "generate" && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className={cn("rounded-xl p-2.5 ring-1", isMusic || isTts || isStt ? "bg-primary/15 ring-primary/30" : isVideo ? "bg-secondary/15 ring-secondary/30" : "bg-secondary/15 ring-secondary/30")}>
                {isVideo ? <Video className="h-5 w-5 text-secondary" /> : isStt ? <FileAudio className="h-5 w-5 text-primary" /> : isTts ? <Mic className="h-5 w-5 text-primary" /> : isMusic ? <Music className="h-5 w-5 text-primary" /> : <Wand2 className="h-5 w-5 text-secondary" />}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{isVideo ? "文生视频" : isStt ? "语音转文字" : isTts ? "文字转语音" : isMusic ? "文生音乐" : "文生图"}</h2>
                <p className="text-xs text-muted-foreground">{isVideo ? "选择视频模型即可生成视频" : isStt ? "上传音频，AI 将其转写为文字" : isTts ? "选择 TTS 模型即可将文字转为语音" : isMusic ? "选择 Lyria 等音乐模型即可生成音乐" : "在下方选择图像、音乐、视频或语音模型"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isVideo ? "视频模型" : isStt ? "转写模型" : isTts ? "语音模型" : isMusic ? "音乐模型" : "图像 / 媒体模型"}</Label>
              <ModelPicker
                settings={settings}
                value={settings.imageModel}
                onChange={(v) => {
                  const next = { ...settings, imageModel: v };
                  saveSettings(next);
                  onSettingsChange?.(next);
                }}
                filter={(id) => isMediaModel(id)}
                placeholder="选择媒体模型"
              />
            </div>

            {isStt && (
              <div className="space-y-3">
                <Label>音频来源</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    className="rounded-lg border-2 border-dashed border-border/60 px-3 py-4 text-center hover:border-primary/60 hover:bg-primary/5 transition-colors"
                  >
                    <FileAudio className="mx-auto h-6 w-6 text-muted-foreground mb-1.5" />
                    <p className="text-xs font-medium">上传音频/视频</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">MP3 WAV 视频 等</p>
                  </button>
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn(
                      "rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors",
                      isRecording
                        ? "border-destructive bg-destructive/10 hover:bg-destructive/20"
                        : "border-border/60 hover:border-primary/60 hover:bg-primary/5"
                    )}
                  >
                    <Mic className={cn("mx-auto h-6 w-6 mb-1.5", isRecording ? "text-destructive animate-pulse" : "text-muted-foreground")} />
                    <p className="text-xs font-medium">{isRecording ? "录音中…点击停止" : "麦克风录音"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{isRecording ? `${Math.floor(recordDuration / 60).toString().padStart(2, "0")}:${(recordDuration % 60).toString().padStart(2, "0")}` : "实时录制"}</p>
                  </button>
                </div>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 50 * 1024 * 1024) { toast.error("文件超过 50MB"); return; }
                    const isVideo = f.type.startsWith("video/");
                    if (isVideo) {
                      try {
                        toast.info("正在从视频中提取音轨…");
                        const dataUrl = await extractAudioFromVideo(f);
                        setSttAudioDataUrl(dataUrl);
                        setSttResult(null);
                        toast.success("音轨提取完成");
                      } catch (err: any) {
                        toast.error("音轨提取失败", { description: err?.message || "不支持的视频格式" });
                      }
                    } else {
                      const r = new FileReader();
                      r.onload = (ev) => {
                        setSttAudioDataUrl(ev.target?.result as string);
                        setSttResult(null);
                      };
                      r.readAsDataURL(f);
                    }
                    e.target.value = "";
                  }}
                />
                {sttAudioDataUrl && (
                  <div className="rounded-lg border border-border/60 p-3 space-y-2">
                    <audio src={sttAudioDataUrl} controls className="w-full" />
                    <button onClick={() => { setSttAudioDataUrl(null); setSttResult(null); }} className="text-xs text-destructive hover:underline">移除音频</button>
                  </div>
                )}
              </div>
            )}

            {!isStt && (<>
            <div className="space-y-2">
              <Label>{isTts ? "语音文本" : isVideo ? "视频描述提示词" : "描述提示词"}</Label>
              <TextareaToolbar textareaRef={promptRef} value={prompt} onChange={setPrompt} />
              <Textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={isTts ? "输入要转为语音的文字内容..." : isVideo ? "尽情描述你想象中的视频画面..." : "尽情描述你想象中的画面..."}
                className="min-h-[140px] resize-none bg-input/60"
              />
            </div>

            <div className="space-y-2">
              <Label>灵感预设</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPrompt(p)}
                    className="text-xs rounded-full border border-border/60 px-3 py-1.5 hover:border-secondary/60 hover:bg-secondary/10 transition-colors"
                  >
                    {p.slice(0, 14)}…
                  </button>
                ))}
              </div>
            </div>
            </>)}

            {!isMusic && !isVideo && !isTts && !isStt && (
              <div className="space-y-2">
                <Label>尺寸</Label>
                <div className="grid grid-cols-3 gap-2">
                  {SIZES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setSize(s.value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs transition-all",
                        size === s.value
                          ? "border-primary bg-primary/10 text-primary glow-primary"
                          : "border-border/60 hover:border-primary/40"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <Select value={SIZES.some(s => s.value === size) ? "__default__" : size} onValueChange={v => { if (v !== "__default__") setSize(v); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="更多尺寸" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__" disabled>常用尺寸 ↑</SelectItem>
                    {MORE_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label} ({s.value})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isVideo && (
              <div className="space-y-2">
                <Label>视频参数</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">时长(秒)</Label>
                    <Select value={String(videoDuration)} onValueChange={v => setVideoDuration(Number(v))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 4, 6, 8, 10].map(d => (
                          <SelectItem key={d} value={String(d)}>{d}s</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">宽高比</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: "横屏 16:9", value: "16:9" },
                        { label: "竖屏 9:16", value: "9:16" },
                      ].map(ar => (
                        <button
                          key={ar.value}
                          onClick={() => setVideoAspectRatio(ar.value)}
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-xs transition-all",
                            videoAspectRatio === ar.value
                              ? "border-primary bg-primary/10 text-primary glow-primary"
                              : "border-border/60 hover:border-primary/40"
                          )}
                        >
                          {ar.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isTts && (
              <div className="space-y-2">
                <Label>播音员</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(isMimoTtsModel(settings.imageModel) ? MIMO_VOICES : OPENAI_VOICES).map(v => (
                    <button
                      key={v.value}
                      onClick={() => setTtsVoice(v.value)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-xs transition-all",
                        ttsVoice === v.value
                          ? "border-primary bg-primary/10 text-primary glow-primary"
                          : "border-border/60 hover:border-primary/40"
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={onGenerate} disabled={loading || (isStt ? !sttAudioDataUrl : !prompt.trim())} variant="hero" size="lg" className="w-full">
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...</>
              ) : isVideo ? (
                <><Video className="mr-2 h-4 w-4" /> 生成视频</>
              ) : isStt ? (
                <><FileAudio className="mr-2 h-4 w-4" /> 开始转写</>
              ) : isTts ? (
                <><Mic className="mr-2 h-4 w-4" /> 生成语音</>
              ) : isMusic ? (
                <><Music className="mr-2 h-4 w-4" /> 生成音乐</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> 立即生成</>
              )}
            </Button>
          </div>
        )}

        {/* 图像编辑面板 */}
        {tab === "edit" && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/15 p-2.5 ring-1 ring-primary/30">
                {isVideo ? <Video className="h-5 w-5 text-primary" /> : isStt ? <FileAudio className="h-5 w-5 text-primary" /> : isTts ? <Mic className="h-5 w-5 text-primary" /> : isMusic ? <Music className="h-5 w-5 text-primary" /> : <Edit3 className="h-5 w-5 text-primary" />}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{isVideo ? "图生视频" : isStt ? "语音转文字" : isTts ? "文字转语音" : isMusic ? "图生音乐" : "图像编辑"}</h2>
                <p className="text-xs text-muted-foreground">{isVideo ? "上传图片，AI 根据画面生成视频" : isStt ? "上传音频，AI 将其转写为文字" : isTts ? "输入文字，AI 将其转为语音" : isMusic ? "上传图片，AI 根据画面生成音乐" : "上传图片并描述编辑需求"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isVideo ? "视频模型" : isStt ? "转写模型" : isTts ? "语音模型" : isMusic ? "音乐模型" : "图像 / 媒体模型"}</Label>
              <ModelPicker
                settings={settings}
                value={settings.imageModel}
                onChange={(v) => {
                  const next = { ...settings, imageModel: v };
                  saveSettings(next);
                  onSettingsChange?.(next);
                }}
                filter={(id) => isMediaModel(id)}
                placeholder="选择媒体模型"
              />
            </div>

            {isStt && (
            <div className="space-y-3">
              <Label>音频来源</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="rounded-lg border-2 border-dashed border-border/60 px-3 py-4 text-center hover:border-primary/60 hover:bg-primary/5 transition-colors"
                >
                  <FileAudio className="mx-auto h-6 w-6 text-muted-foreground mb-1.5" />
                  <p className="text-xs font-medium">上传音频/视频</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">MP3 WAV 视频 等</p>
                </button>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors",
                    isRecording
                      ? "border-destructive bg-destructive/10 hover:bg-destructive/20"
                      : "border-border/60 hover:border-primary/60 hover:bg-primary/5"
                  )}
                >
                  <Mic className={cn("mx-auto h-6 w-6 mb-1.5", isRecording ? "text-destructive animate-pulse" : "text-muted-foreground")} />
                  <p className="text-xs font-medium">{isRecording ? "录音中…点击停止" : "麦克风录音"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{isRecording ? `${Math.floor(recordDuration / 60).toString().padStart(2, "0")}:${(recordDuration % 60).toString().padStart(2, "0")}` : "实时录制"}</p>
                </button>
              </div>
              {sttAudioDataUrl && (
                <div className="rounded-lg border border-border/60 p-3 space-y-2">
                  <audio src={sttAudioDataUrl} controls className="w-full" />
                  <button onClick={() => { setSttAudioDataUrl(null); setSttResult(null); }} className="text-xs text-destructive hover:underline">移除音频</button>
                </div>
              )}
            </div>
            )}

            {!isTts && !isStt && (
            <div className="space-y-2">
              <Label>{isVideo ? "上传参考图片/视频" : "上传图片"}</Label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border-2 border-dashed border-border/60 px-4 py-6 text-center hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">{isVideo ? "点击上传参考图片或视频" : "点击上传或拖拽图片"}</p>
                <p className="text-xs text-muted-foreground">{isVideo ? "支持 PNG、JPG、MP4、WebM 等格式" : "支持 PNG、JPG 等格式，最大 8MB，可上传多张"}</p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={isVideo ? "image/*,video/*" : "image/*"}
                multiple
                className="hidden"
                onChange={onUploadImage}
              />
              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {uploadedImages.map((img) => (
                    <div key={img.id} className="relative rounded-lg border border-border/60 overflow-hidden">
                      {img.type === "video" ? (
                        <video src={img.dataUrl} className="w-full h-24 object-cover" muted />
                      ) : (
                        <img src={img.dataUrl} alt="上传的图片" className="w-full h-24 object-cover" />
                      )}
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute top-1 right-1 rounded-full bg-destructive p-1 hover:bg-destructive/80 transition-colors"
                        title="删除"
                      >
                        <X className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            <div className="space-y-2">
              <Label>{isTts ? "语音文本" : isVideo ? "视频描述提示词" : isMusic ? "音乐描述提示词" : isMatting ? "编辑提示词（可选，抠图模型无需填写）" : "编辑提示词"}</Label>
              <TextareaToolbar textareaRef={editPromptRef} value={editPrompt} onChange={setEditPrompt} />
              <Textarea
                ref={editPromptRef}
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder={isTts ? "输入要转为语音的文字内容..." : isVideo ? "描述你想要的视频效果..." : isMusic ? "描述你想要的音乐风格，例如：根据画面氛围，生成史诗感的电影配乐..." : isMatting ? "抠图模型无需提示词，可直接点击编辑..." : "描述你想对图片做的修改，例如：把背景改成蓝色..."}
                className="min-h-[100px] resize-none bg-input/60"
              />
            </div>

            <Button
              onClick={onEdit}
              disabled={editLoading || (isStt ? !sttAudioDataUrl : (!editPrompt.trim() && !isMatting) || (!isTts && !isStt && uploadedImages.length === 0))}
              variant="hero"
              size="lg"
              className="w-full"
            >
              {editLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isStt ? "转写中..." : isVideo ? "生成视频中..." : isTts ? "生成语音中..." : isMusic ? "生成音乐中..." : "编辑中..."}</>
              ) : isStt ? (
                <><FileAudio className="mr-2 h-4 w-4" /> 开始转写</>
              ) : isVideo ? (
                <><Video className="mr-2 h-4 w-4" /> 生成视频</>
              ) : isTts ? (
                <><Mic className="mr-2 h-4 w-4" /> 生成语音</>
              ) : isMusic ? (
                <><Music className="mr-2 h-4 w-4" /> 生成音乐</>
              ) : (
                <><Edit3 className="mr-2 h-4 w-4" /> 开始编辑</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* 结果展示 */}
      <div className="glass rounded-2xl p-4 md:p-6 min-h-[500px] flex items-center justify-center relative overflow-hidden">
        {sttResult ? (
          <div className="w-full space-y-4">
            <div className="relative rounded-2xl overflow-hidden ring-1 ring-primary/30 bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent p-6">
              <div className="flex flex-col items-center gap-3 mb-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/40 blur-2xl animate-pulse" />
                  <div className="relative rounded-full bg-gradient-to-br from-primary to-secondary p-4 shadow-2xl">
                    <FileAudio className="h-8 w-8 text-primary-foreground" />
                  </div>
                </div>
                <p className="text-sm font-medium">语音转写结果</p>
              </div>
              <div className="rounded-xl bg-card/60 border border-border/60 p-4 max-h-[360px] overflow-y-auto">
                {sttResult.split("\n\n").filter(Boolean).map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed indent-[2em] mb-2 last:mb-0">{para}</p>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="glow" onClick={async () => {
                try { await navigator.clipboard.writeText(sttResult); toast.success("已复制转写文本"); } catch { toast.error("复制失败"); }
              }}>
                <Copy className="mr-2 h-4 w-4" /> 复制文本
              </Button>
            </div>
          </div>
        ) : tab === "generate" && videoUrl ? (
          <VideoResult url={videoUrl} mime={videoMime} onDownload={() => downloadVideo(videoUrl, videoMime, "ai-video")} />
        ) : tab === "edit" && editedVideoUrl ? (
          <VideoResult url={editedVideoUrl} mime={editedVideoMime} onDownload={() => downloadVideo(editedVideoUrl, editedVideoMime, "ai-video")} />
        ) : tab === "generate" && audioUrl ? (
          <AudioResult url={audioUrl} mime={audioMime} onDownload={() => downloadAudio(audioUrl, audioMime, "ai-music")} icon={isTts ? "tts" : "music"} />
        ) : tab === "edit" && editedAudioUrl ? (
          <AudioResult url={editedAudioUrl} mime={editedAudioMime} onDownload={() => downloadAudio(editedAudioUrl, editedAudioMime, "ai-music")} icon={isTts ? "tts" : "music"} />
        ) : tab === "generate" && imageUrl ? (
          <div className="w-full space-y-4">
            <div className="relative rounded-xl overflow-auto ring-1 ring-border/60 h-[70vh] flex items-center justify-center bg-muted/20">
              <img
                key={imageUrl}
                src={imageUrl}
                alt="生成结果"
                className="max-h-full w-auto animate-image-reveal"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="glow" onClick={onDownload}>
                <Download className="mr-2 h-4 w-4" /> 下载图片
              </Button>
            </div>
          </div>
        ) : tab === "edit" && editedImageUrl ? (
          <div className="w-full space-y-4">
            <div className="relative rounded-xl overflow-auto ring-1 ring-border/60 h-[70vh] flex items-center justify-center bg-muted/20">
              <img
                key={editedImageUrl}
                src={editedImageUrl}
                alt="编辑结果"
                className="max-h-full w-auto animate-image-reveal"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="glow" onClick={onDownloadEdited}>
                <Download className="mr-2 h-4 w-4" /> 下载图片
              </Button>
            </div>
          </div>
        ) : loading || editLoading ? (
          <DiffusionLoader label={isStt ? "AI 正在转写中..." : isVideo ? "AI 正在生成视频..." : isTts ? "AI 正在合成语音..." : isMusic ? "AI 正在谱曲中..." : tab === "edit" ? "AI 正在编辑中..." : "AI 正在绘制中..."} />
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground text-center">
            <div className="rounded-2xl bg-card/50 p-6 ring-1 ring-border/60">
              {isVideo ? <Video className="h-10 w-10 text-secondary/60" /> : isStt ? <FileAudio className="h-10 w-10 text-primary/60" /> : isTts ? <Mic className="h-10 w-10 text-primary/60" /> : isMusic ? <Music className="h-10 w-10 text-primary/60" /> : <ImageIcon className="h-10 w-10 text-secondary/60" />}
            </div>
            <p className="text-sm">
              {isStt
                ? "上传音频，AI 将为你转写为文字"
                : isVideo
                ? tab === "generate" ? "输入描述，让 AI 为你生成视频" : "上传图片，根据画面生成视频"
                : isTts
                ? "输入文字，AI 将为你合成语音"
                : isMusic
                ? tab === "generate" ? "输入描述，让 AI 为你谱写音乐" : "上传图片，根据画面生成音乐"
                : tab === "generate" ? "输入提示词，让想象成为画面" : "上传图片并描述编辑需求"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

function AudioResult({ url, mime, onDownload, icon }: { url: string; mime: string; onDownload: () => void; icon?: "music" | "tts" }) {
  const isTts = icon === "tts";
  return (
    <div className="w-full space-y-5">
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-primary/30 bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent p-8">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/40 blur-2xl animate-pulse" />
            <div className="relative rounded-full bg-gradient-to-br from-primary to-secondary p-6 shadow-2xl">
              {isTts ? <Mic className="h-12 w-12 text-primary-foreground" /> : <Music className="h-12 w-12 text-primary-foreground" />}
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">{isTts ? "AI 生成语音" : "AI 生成音乐"}</p>
            <p className="text-xs text-muted-foreground mt-1">{mime}</p>
          </div>
          <audio
            key={url}
            src={url}
            controls
            autoPlay
            className="w-full max-w-md"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="glow" onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" /> {isTts ? "下载语音" : "下载音乐"}
        </Button>
      </div>
    </div>
  );
}

function VideoResult({ url, mime, onDownload }: { url: string; mime: string; onDownload: () => void }) {
  return (
    <div className="w-full space-y-5">
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-secondary/30 bg-gradient-to-br from-secondary/10 via-primary/5 to-transparent p-6">
        <video
          key={url}
          src={url}
          controls
          autoPlay
          className="w-full rounded-lg"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="glow" onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" /> 下载视频
        </Button>
      </div>
    </div>
  );
}

export default ImagePanel;
