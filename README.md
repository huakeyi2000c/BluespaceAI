# BluespaceAI - 蓝色空间智能创作平台

一款基于 React + Vite 构建的全能 AI 创作平台，兼容所有 OpenAI 格式 API，支持对话、图像生成/编辑、视频生成、音乐合成、语音合成(TTS)、语音转写(STT)、智能抠图等 7 大创作模式。

## 功能特性

### 多模态创作

| 模式 | 说明 | 端点回退链 |
|------|------|-----------|
| 对话 | SSE 流式对话，支持 System Prompt / Jailbreak | `/chat/completions` |
| 文生图 / 图生图 | 支持多种尺寸、图像编辑 | `/images/generations` → `/chat/completions` |
| 文生视频 / 图生视频 | 支持时长/比例设置 | `/videos/generations` → `/chat/completions` |
| 文生音乐 / 图生音乐 | 支持音频输出 | `/audio/music` → `/chat/completions` |
| 文字转语音 (TTS) | 多播音员选择，兼容 OpenAI / MiMo | `/audio/speech` → `/chat/completions` |
| 语音转写 (STT) | 音频上传转文字 | `/audio/transcriptions` → `/chat/completions` |
| 智能抠图 | 自动去除背景 | `/images/edits` → `/chat/completions` |

### 核心能力

- **全 OpenAI 兼容** — 自动适配标准 Bearer、Azure `api-key`、Anthropic `x-api-key`、MiMo `api-key` 等认证方式
- **智能模型识别** — 根据模型名自动分类为 对话/图像/音乐/视频/语音/转写/抠图，UI 自动切换对应创作面板
- **端点自动回退** — 主端点 404/405 时自动尝试去 `/v1` 前缀、`/chat/completions` 等备选路由
- **CORS 代理** — 直连失败自动切换后端代理，开发环境通过 Vite 中间件，生产环境通过 `/api/ai-proxy`
- **流式响应增强** — `stream_options: { include_usage: true }` 获取 token 用量；`finish_reason` 实时提示截断/过滤
- **跨块 JSON 重组** — SSE 流跨 chunk 的 JSON 片段自动拼接（最多 3 次重试）
- **高级生成参数** — Temperature / Top P / Max Tokens / Seed / Frequency Penalty / Presence Penalty / Response Format
- **请求超时** — 对话 60s，图像/TTS/视频 120s，防止请求无限挂起
- **429 自动重试** — 遇到速率限制自动重试

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 (SWC) |
| 样式 | Tailwind CSS + shadcn/ui |
| 状态 | React Hook + localStorage 持久化 |
| 后端 | Supabase (在线统计 / Presence) |
| 部署 | Vercel (Serverless API 代理) |
| 测试 | Vitest + Testing Library |

## 快速开始

### 环境要求

- Node.js ≥ 18
- npm / bun / pnpm

### 安装

```bash
# 克隆仓库
git clone <repo-url>
cd zhi-hui-AI

# 安装依赖
npm install
# 或
bun install
```

### 开发

```bash
npm run dev
# 访问 http://localhost:8080
```

### 构建

```bash
npm run build        # 生产构建
npm run build:dev    # 开发模式构建
npm run preview      # 预览构建结果
```

### 测试

```bash
npm run test         # 单次运行
npm run test:watch   # 监听模式
```

## 项目结构

```
├── api/                      # Vercel Serverless Functions
│   └── ai-proxy.ts           #   CORS 代理（生产环境）
├── public/                   # 静态资源
├── src/
│   ├── components/
│   │   ├── ui/               # shadcn/ui 组件库
│   │   ├── ChatPanel.tsx     # 对话面板
│   │   ├── ImagePanel.tsx    # 媒体创作面板（图/视频/音乐/TTS/STT/抠图）
│   │   ├── SettingsPanel.tsx # 设置面板（含高级生成参数）
│   │   ├── ModelPicker.tsx   # 模型选择器（搜索/手动添加/刷新）
│   │   ├── JailbreakDialog.tsx # 越狱提示词管理
│   │   ├── DiffusionLoader.tsx  # AI 生成加载动画
│   │   └── AuroraBackground.tsx # 极光背景效果
│   ├── lib/
│   │   └── aiClient.ts       # 核心 AI 客户端（所有 API 交互）
│   ├── integrations/
│   │   └── supabase/         # Supabase 客户端
│   ├── pages/
│   │   └── Index.tsx         # 主页面
│   └── main.tsx              # 入口
├── supabase/                 # Supabase 配置 & SQL
├── vercel.json               # Vercel 部署配置
├── vite.config.ts            # Vite 配置（含开发代理中间件）
└── package.json
```

## 配置说明

### API 密钥

在「设置」面板填入你的 API 密钥，支持以下来源：

1. **手动输入** — 直接在设置中填写
2. **环境变量** — `VITE_FALLBACK_API_KEY`，当本地无密钥时自动使用

### 认证方式自动识别

| 网关 | 认证方式 |
|------|---------|
| 标准 OpenAI 兼容 | `Authorization: Bearer <key>` |
| Azure OpenAI | `api-key: <key>` |
| Anthropic | `x-api-key: <key>` + `anthropic-version: 2023-06-01` |
| 小米 MiMo | `api-key: <key>` (tp- 开头密钥) |

### 模型识别规则

模型名通过正则自动分类，优先级从高到低：

```
抠图 → 转写(STT) → 语音(TTS) → 音乐 → 视频 → 图像 → 对话 → 未知
```

支持的模型关键词（部分）：

| 类型 | 示例关键词 |
|------|-----------|
| 对话 | gpt, claude, gemini, llama, qwen, deepseek, glm, mistral, yi-, phi-, grok |
| 图像 | dall-e, flux, stable-diffusion, imagen, midjourney, cogview, kling, gpt-image |
| 视频 | sora, cogvideo, kling-video, runway, pika, luma, wanx, hailuo, vidu, veo, seedance |
| 音乐 | lyria, musicgen, suno, udio, stable-audio, jukebox, riffusion, acestep |
| TTS | tts, bark, cosyvoice, fish-speech, elevenlabs, qwen-tts, mimo-tts, kokoro |
| STT | whisper, stt, transcri, speech-to-text, wav2vec, nemo-stt |
| 抠图 | rmbg, remove-bg, matting, segment-anything, sam |

### 高级生成参数

在设置面板底部可展开「高级生成参数」：

| 参数 | 范围 | 说明 |
|------|------|------|
| Temperature | 0 - 2 | 采样随机性 |
| Top P | 0 - 1 | 核采样概率 |
| Max Tokens | - | 最大生成 token 数 |
| Seed | - | 可复现采样种子 |
| Presence Penalty | -2 - 2 | 出现惩罚 |
| Frequency Penalty | -2 - 2 | 频率惩罚 |
| Response Format | text / JSON Mode | 输出格式 |

## 部署

### Vercel (推荐)

1. Fork 本仓库
2. 在 Vercel 导入项目
3. 如需环境变量，设置 `VITE_FALLBACK_API_KEY`
4. 部署完成，`api/ai-proxy.ts` 自动作为 Serverless Function 运行

### 其他平台

需要自行配置 CORS 代理以转发 API 请求。项目内置了 Vite 开发代理中间件，生产环境需自行实现 `/api/public/ai-proxy` 端点。

代理接口规范：
- **POST** `/api/public/ai-proxy`
- **请求体**: `{ url: string, method: string, headers: Record<string, string>, body?: string }`
- **响应**: 透传上游状态码、Content-Type 和 Body

## 许可证

MIT
