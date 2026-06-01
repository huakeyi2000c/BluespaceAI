import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT =
  "你是「霓界 NeonMind」——一位富有想象力的中文 AI 助手。请使用简体中文回答，语言生动、条理清晰，必要时使用 Markdown。";

// List user's conversations
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Get single conversation + messages
export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conv, error: e1 } = await context.supabase
      .from("conversations")
      .select("id,title")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!conv) return null;
    const { data: msgs, error: e2 } = await context.supabase
      .from("messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    if (e2) throw new Error(e2.message);
    return { conversation: conv, messages: msgs ?? [] };
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title?: string }) =>
    z.object({ title: z.string().max(100).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error } = await context.supabase
      .from("conversations")
      .insert({ user_id: context.userId, title: data.title || "新对话" })
      .select("id,title,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return conv;
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; title: string }) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Stream chat completion
export const streamChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; prompt: string }) =>
    z
      .object({
        conversationId: z.string().uuid(),
        prompt: z.string().min(1).max(8000),
      })
      .parse(d),
  )
  .handler(async function* ({ data, context }) {
    const { supabase, userId } = context;

    // verify conversation belongs to user
    const { data: conv } = await supabase
      .from("conversations")
      .select("id,title")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) throw new Error("对话不存在或无权限");

    // load history
    const { data: history } = await supabase
      .from("messages")
      .select("role,content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.prompt },
    ];

    // save user message
    await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "user",
      content: data.prompt,
    });

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("缺少 LOVABLE_API_KEY");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      if (resp.status === 429) throw new Error("请求太频繁，请稍后再试");
      if (resp.status === 402) throw new Error("AI 额度已用完，请补充额度");
      throw new Error(`AI 服务出错: ${resp.status}`);
    }

    let buffer = "";
    let assembled = "";
    const decoder = new TextDecoderStream();
    const reader = resp.body.pipeThrough(decoder).getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta: string | undefined =
              json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content;
            if (delta) {
              assembled += delta;
              yield { delta };
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // persist assistant message + bump conversation
    if (assembled) {
      await supabase.from("messages").insert({
        conversation_id: data.conversationId,
        user_id: userId,
        role: "assistant",
        content: assembled,
      });
    }
    const newTitle =
      conv.title === "新对话" && data.prompt
        ? data.prompt.slice(0, 24)
        : conv.title;
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), title: newTitle })
      .eq("id", data.conversationId);
  });
