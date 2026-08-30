import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

import { decide, type BotSettings } from "@/lib/bot-brain.server";
import { generateImage, generateVoice, type AiMessage } from "@/lib/ai.server";
import {
  getMe,
  sendChatAction,
  sendMessage,
  sendPhoto,
  sendVoice,
  telegramWebhookSecret,
} from "@/lib/telegram.server";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const DEFAULTS: BotSettings = {
  owner_username: "officialmarco22",
  persona: "",
  knowledge: "",
  images_enabled: true,
  voice_enabled: true,
};

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let expected: string;
        try {
          expected = telegramWebhookSecret();
        } catch (error) {
          console.error(error);
          return new Response("Not configured", { status: 500 });
        }
        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
        const update = (await request.json()) as any;
        const message = update?.message ?? update?.edited_message;
        const chatId: number | undefined = message?.chat?.id;
        if (!chatId || typeof update.update_id !== "number") {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        const text: string = message.text ?? message.caption ?? "";
        const username: string | null = message.from?.username ?? null;
        const chatTitle: string | null = message.chat?.title ?? null;

        await db.from("telegram_messages").upsert(
          {
            update_id: update.update_id,
            chat_id: chatId,
            chat_title: chatTitle,
            user_id: message.from?.id ?? null,
            username,
            first_name: message.from?.first_name ?? null,
            role: "user",
            text,
            kind: message.photo ? "photo" : message.voice ? "voice" : "text",
            raw: update,
          },
          { onConflict: "update_id" },
        );

        // Decide whether the bot should speak up.
        const me = await getMe();
        const isPrivate = message.chat?.type === "private";
        const mentioned =
          !!me.username && text.toLowerCase().includes(`@${me.username.toLowerCase()}`);
        const repliedToBot = message.reply_to_message?.from?.id === me.id;
        const command = /^\/(ask|marco)\b/i.test(text.trim());
        if (!isPrivate && !mentioned && !repliedToBot && !command) {
          return Response.json({ ok: true, silent: true });
        }
        if (!text.trim() && !message.photo) {
          return Response.json({ ok: true, silent: true });
        }

        const { data: settingsRow } = await db
          .from("bot_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle();
        const settings: BotSettings = { ...DEFAULTS, ...(settingsRow ?? {}) };
        const owner = settings.owner_username.replace(/^@/, "");
        const isOwner = (username ?? "").toLowerCase() === owner.toLowerCase();

        const { data: recent } = await db
          .from("telegram_messages")
          .select("role, text, username, first_name")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: false })
          .limit(14);

        const history: AiMessage[] = (recent ?? [])
          .slice()
          .reverse()
          .filter((row: any) => (row.text ?? "").trim())
          .map((row: any) => ({
            role: row.role === "assistant" ? "assistant" : "user",
            content:
              row.role === "assistant"
                ? row.text
                : `${row.username ? "@" + row.username : (row.first_name ?? "user")}: ${row.text}`,
          }));

        await sendChatAction(chatId, "typing");
        const decision = await decide(settings, isOwner, history);

        const replyTo = message.message_id as number | undefined;

        if (decision.want_voice) {
          try {
            await sendChatAction(chatId, "record_voice");
            const ogg = await generateVoice(decision.reply);
            await sendVoice(chatId, ogg, replyTo);
          } catch (error) {
            console.error("voice failed", error);
            await sendMessage(chatId, decision.reply, replyTo);
          }
        } else {
          await sendMessage(chatId, decision.reply, replyTo);
        }

        await db.from("telegram_messages").insert({
          chat_id: chatId,
          chat_title: chatTitle,
          role: "assistant",
          text: decision.reply,
          kind: decision.want_voice ? "voice" : "text",
        });

        if (decision.want_image && decision.image_prompt) {
          try {
            await sendChatAction(chatId, "upload_photo");
            const png = await generateImage(decision.image_prompt);
            await sendPhoto(chatId, png, "Ye lo bhai 👇", replyTo);
          } catch (error) {
            console.error("image failed", error);
            await sendMessage(chatId, "Bhai image banane me dikkat aa gayi, thodi der baad try kar.", replyTo);
          }
        }

        if (decision.lecture_issue) {
          await sendMessage(
            chatId,
            `@${owner} boss dekho iska lecture nahi chal raha hai 🙏`,
          );
        }

        if (decision.report && !isOwner) {
          const verb = decision.report.action === "ban" ? "ban him" : "kick him";
          await sendMessage(
            chatId,
            `@${owner} boss ${verb} — ${username ? "@" + username : (message.from?.first_name ?? "ye user")} ${decision.report.reason}`,
          );
          await db.from("moderation_reports").insert({
            chat_id: chatId,
            chat_title: chatTitle,
            user_id: message.from?.id ?? null,
            username,
            action: decision.report.action,
            reason: decision.report.reason,
            message_text: text,
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
