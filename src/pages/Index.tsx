import { useEffect, useState } from "react";
import { MessageSquare, ImageIcon, Settings as SettingsIcon, Zap, KeyRound, AlertCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuroraBackground from "@/components/AuroraBackground";
import ChatPanel from "@/components/ChatPanel";
import ImagePanel from "@/components/ImagePanel";
import SettingsPanel from "@/components/SettingsPanel";
import JailbreakDialog from "@/components/JailbreakDialog";
import { AISettings, loadSettings } from "@/lib/aiClient";

const Index = () => {
  const [settings, setSettings] = useState<AISettings>(loadSettings);
  const [tab, setTab] = useState("chat");
  const [visits, setVisits] = useState<number | null>(null);
  const [online, setOnline] = useState<number>(1);

  useEffect(() => {
    const channel = supabase.channel("online-users", {
      config: { presence: { key: Math.random().toString(36).slice(2) } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnline(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessionKey = "visit_counted_v1";
      const alreadyCounted = sessionStorage.getItem(sessionKey);
      if (!alreadyCounted) {
        const { data: cur } = await supabase.from("site_stats").select("visits").eq("id", 1).maybeSingle();
        const next = (cur?.visits ?? 0) + 1;
        await supabase.from("site_stats").update({ visits: next, updated_at: new Date().toISOString() }).eq("id", 1);
        sessionStorage.setItem(sessionKey, "1");
        if (!cancelled) setVisits(next);
      } else {
        const { data } = await supabase.from("site_stats").select("visits").eq("id", 1).maybeSingle();
        if (!cancelled) setVisits(data?.visits ?? 0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.title = "AI 对话 & 文生图 · 蓝色间智能创作平台";
    const desc = document.querySelector('meta[name="description"]');
    const content = "炫酷的中文 AI 对话与文生图工具，兼容 OpenAI 协议，自带 API 密钥配置。";
    if (desc) desc.setAttribute("content", content);
    else {
      const m = document.createElement("meta");
      m.name = "description"; m.content = content; document.head.appendChild(m);
    }
  }, []);

  const noKey = !settings.apiKey;

  return (
    <div className="min-h-screen text-foreground">
      <AuroraBackground />

      <header className="container max-w-6xl py-8 md:py-12">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-primary/40 blur-lg" />
              <div className="relative rounded-xl bg-gradient-to-br from-primary to-secondary p-2.5">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight">
                <span className="text-gradient">BluespaceAI</span> 蓝色空间智能创作平台
              </h1>
              <p className="text-xs text-muted-foreground">对话 · 绘画 · 一键开启</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${noKey ? "bg-destructive" : "bg-emerald-400 shadow-[0_0_10px_hsl(150_80%_50%)]"}`} />
            <span className="text-muted-foreground">{noKey ? "未配置密钥" : "已就绪"}</span>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl pb-20">
        <section className="text-center mb-10 md:mb-14">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
            免费密钥 <br className="sm:hidden" />
            <span className="text-gradient">解锁全部 AI 能力</span>
          </h2>
          <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            兼容 OpenAI 协议的对话与文生图体验，本地浏览器安全保存，无服务器、无追踪。
          </p>
            <p className="mt-5 text-center"> <a href="https://discord.gg/GNm8RQwTD" target="_blank" className="text-blue-500 hover:text-blue-700 underline">
             FreeTheAI Discord</a> 推荐AI获取免费API密钥 </p>
             <p className="mt-5 text-center">推荐二：<a href="https://api.code-relay.com/register?aff=dIsJ38" target="_blank" className="text-blue-500 hover:text-blue-700 underline">
             code-relay</a> AI获取免费API密钥 </p>
        </section>

        {noKey && (
          <div className="glass rounded-xl px-4 py-3 mb-5 flex items-center gap-3 border-primary/40">
            <AlertCircle className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground flex-1">
              请先到 <button onClick={() => setTab("settings")} className="text-primary underline-offset-2 hover:underline">设置</button> 中配置 API 密钥。
            </p>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <TabsList className="glass !bg-card/40 p-1 h-auto">
              <TabsTrigger value="chat" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_20px_hsl(var(--primary)/0.3)] gap-2 px-4 py-2">
                <MessageSquare className="h-4 w-4" /> AI 对话
              </TabsTrigger>
              <TabsTrigger value="image" className="data-[state=active]:bg-secondary/15 data-[state=active]:text-secondary data-[state=active]:shadow-[0_0_20px_hsl(var(--secondary)/0.3)] gap-2 px-4 py-2">
                <ImageIcon className="h-4 w-4" /> 文生图
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-foreground/10 gap-2 px-4 py-2">
                <SettingsIcon className="h-4 w-4" /> 设置
              </TabsTrigger>
            </TabsList>
            <JailbreakDialog settings={settings} onChange={setSettings} />
          </div>

          <TabsContent value="chat" className="mt-0">
            <ChatPanel settings={settings} onSettingsChange={setSettings} />
          </TabsContent>
          <TabsContent value="image" className="mt-0">
            <ImagePanel settings={settings} onSettingsChange={setSettings} />
          </TabsContent>
          <TabsContent value="settings" className="mt-0">
            <SettingsPanel settings={settings} onChange={setSettings} />
          </TabsContent>
        </Tabs>

        <footer className="mt-16 text-center text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-2">
            <KeyRound className="h-3 w-3" />
           <span>
             Copyright © 2025{" "}<a href="https://c1.5918918.xyz/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 hover:underline cursor-pointer">
             蓝色空间-AI 故事创作平台</a>. All rights reserved.
           </span>
          </div>
          <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/40 px-3 py-1 text-[11px]">
              <Users className="h-3 w-3 text-primary" />
              <span>累计访问</span>
              <span className="font-semibold text-foreground tabular-nums">
                {visits === null ? "—" : visits.toLocaleString()}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/40 px-3 py-1 text-[11px]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>在线</span>
              <span className="font-semibold text-foreground tabular-nums">{online}</span>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
