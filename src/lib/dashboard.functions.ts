import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PasswordInput = z.object({ password: z.string() });

const SettingsInput = z.object({
  password: z.string(),
  owner_username: z.string(),
  persona: z.string(),
  knowledge: z.string(),
  images_enabled: z.boolean(),
  voice_enabled: z.boolean(),
});

function checkPassword(password: string) {
  const expected = process.env["DASHBOARD_PASSWORD"];
  if (!expected) throw new Error("Dashboard password is not configured yet.");
  if (password !== expected) throw new Error("Galat password.");
}

export const loadDashboard = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PasswordInput.parse(input))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const [messages, reports, settings] = await Promise.all([
      db
        .from("telegram_messages")
        .select("id, chat_title, chat_id, username, first_name, role, text, kind, created_at")
        .order("created_at", { ascending: false })
        .limit(60),
      db.from("moderation_reports").select("*").order("created_at", { ascending: false }).limit(40),
      db.from("bot_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    return {
      messages: (messages.data ?? []) as any[],
      reports: (reports.data ?? []) as any[],
      settings: (settings.data ?? null) as any,
    };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SettingsInput.parse(input))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db
      .from("bot_settings")
      .update({
        owner_username: data.owner_username.replace(/^@/, ""),
        persona: data.persona,
        knowledge: data.knowledge,
        images_enabled: data.images_enabled,
        voice_enabled: data.voice_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const WebhookInput = z.object({ password: z.string(), base_url: z.string() });

export const setupWebhook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => WebhookInput.parse(input))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const base = data.base_url.replace(/\/+$/, "");
    if (!base.startsWith("https://") || !base.includes("lovable.app")) {
      throw new Error("Webhook sirf published Lovable URL pe set ho sakta hai. Pehle publish karo.");
    }
    const { telegramWebhookSecret, setWebhook, getWebhookInfo, getMe } = await import(
      "@/lib/telegram.server"
    );
    const secret = telegramWebhookSecret();
    const url = `${base}/api/public/telegram/webhook`;
    await setWebhook(url, secret);
    const info = await getWebhookInfo();
    const me = await getMe();
    return {
      ok: true,
      url,
      bot_username: me.username,
      webhook_url: info.url,
      has_pending_updates: info.has_pending_updates,
      last_error_message: info.last_error_message ?? null,
    };
  });
