import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

import {
  decide,
  isAbusive,
  ownerSaysNo,
  ownerSaysYes,
  type BotSettings,
  type RelationRow,
} from "@/lib/bot-brain.server";
import { generateImage, generateSong, generateVoice, type AiMessage } from "@/lib/ai.server";
import {
  banChatMember,
  getMe,
  kickChatMember,
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

function detectAutotune(text: string): boolean | null {
  const t = text.toLowerCase();
  if (/(bina|without|no)\s*auto\s*-?\s*tune/.test(t) || /\bwithout\b/.test(t)) return false;
  if (/auto\s*-?\s*tune/.test(t)) return true;
  return null;
}

function stripSongNoise(text: string) {
  return text
    .replace(/@\w+/g, "")
    .replace(/(bina|without|with|ke saath|ke sath|sath)?\s*auto\s*-?\s*tune( ke)?( sath| saath)?/gi, "")
    .replace(/\b(gaana|gana|song|sing|gaa|gao|gaao|sunao|suna|please|plz)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
          const fromId: number | null = message.from?.id ?? null;
          const chatTitle: string | null = message.chat?.title ?? null;

          await db.from("telegram_messages").upsert(
            {
              update_id: update.update_id,
              chat_id: chatId,
              chat_title: chatTitle,
              user_id: fromId,
              username,
              first_name: message.from?.first_name ?? null,
              role: "user",
              text,
              kind: message.photo ? "photo" : message.voice ? "voice" : "text",
              raw: update,
            },
            { onConflict: "update_id" },
          );

          const { data: settingsRow } = await db
            .from("bot_settings")
            .select("*")
            .eq("id", 1)
            .maybeSingle();
          const settings: BotSettings = { ...DEFAULTS, ...(settingsRow ?? {}) };
          const owner = settings.owner_username.replace(/^@/, "");
          const isOwner = (username ?? "").toLowerCase() === owner.toLowerCase();

          const me = await getMe();
          const isPrivate = message.chat?.type === "private";
          const mentioned =
            !!me.username && text.toLowerCase().includes(`@${me.username.toLowerCase()}`);
          const repliedToBot = message.reply_to_message?.from?.id === me.id;
          const command = /^\/(ask|marco|song|gana)\b/i.test(text.trim());
          const abusive = !isOwner && isAbusive(text);

          /* ---------- 1. Owner ne pending action approve/reject kiya ---------- */
          if (isOwner && text.trim()) {
            const { data: pending } = await db
              .from("pending_actions")
              .select("*")
              .eq("chat_id", chatId)
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (pending && Date.now() - new Date(pending.created_at).getTime() < 60 * 60 * 1000) {
              if (ownerSaysYes(text)) {
                const target = pending.target_username
                  ? `@${pending.target_username}`
                  : "ye user";
                if (pending.action === "warn") {
                  const { data: warnRow } = await db
                    .from("user_warnings")
                    .select("*")
                    .eq("chat_id", chatId)
                    .eq("user_id", pending.target_user_id)
                    .maybeSingle();
                  const count = (warnRow?.count ?? 0) + 1;
                  await db.from("user_warnings").upsert(
                    {
                      chat_id: chatId,
                      user_id: pending.target_user_id,
                      username: pending.target_username,
                      count,
                      last_reason: pending.reason,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "chat_id,user_id" },
                  );
                  await sendMessage(
                    chatId,
                    `⚠️ ${target} ye tumhari ${count} warning hai — ${pending.reason ?? "galat behaviour"}. Sudhar ja warna boss se kick ki permission le lunga.`,
                  );
                } else if (pending.target_user_id) {
                  try {
                    if (pending.action === "ban") await banChatMember(chatId, pending.target_user_id);
                    else await kickChatMember(chatId, pending.target_user_id);
                    await sendMessage(
                      chatId,
                      `✅ Boss, ${target} ko ${pending.action === "ban" ? "ban" : "kick"} kar diya.`,
                    );
                  } catch (error) {
                    console.error("moderation action failed", error);
                    await sendMessage(
                      chatId,
                      `Boss ${target} ko hata nahi paya — mujhe group me admin bana do (ban users permission ke saath).`,
                    );
                  }
                }
                await db
                  .from("pending_actions")
                  .update({ status: "approved" })
                  .eq("id", pending.id);
                await db.from("moderation_reports").insert({
                  chat_id: chatId,
                  chat_title: chatTitle,
                  user_id: pending.target_user_id,
                  username: pending.target_username,
                  action: pending.action,
                  reason: `${pending.reason ?? ""} (owner approved)`.trim(),
                  message_text: null,
                });
                return Response.json({ ok: true, action: pending.action });
              }
              if (ownerSaysNo(text)) {
                await db
                  .from("pending_actions")
                  .update({ status: "rejected" })
                  .eq("id", pending.id);
                await sendMessage(chatId, "Theek hai boss, chhod deta hoon 🙏");
                return Response.json({ ok: true, action: "rejected" });
              }
            }
          }

          /* ---------- 2. Gaane ka pending sawaal ---------- */
          if (text.trim() && !command) {
            const { data: songReq } = await db
              .from("song_requests")
              .select("*")
              .eq("chat_id", chatId)
              .eq("stage", "awaiting_song")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (
              songReq &&
              Date.now() - new Date(songReq.created_at).getTime() < 30 * 60 * 1000 &&
              (!songReq.user_id || songReq.user_id === fromId)
            ) {
              const autotune = detectAutotune(text) ?? true;
              const song = stripSongNoise(text) || songReq.song || "koi romantic hindi gaana";
              await db
                .from("song_requests")
                .update({ stage: "done", song, autotune })
                .eq("id", songReq.id);
              await sendMessage(
                chatId,
                `Chalo boss, "${song}" ${autotune ? "autotune ke saath" : "bina autotune ke"} gaa raha hoon 🎤`,
                message.message_id,
              );
              try {
                await sendChatAction(chatId, "record_voice");
                const { audio } = await generateSong(song, autotune, text);
                await sendVoice(chatId, audio, message.message_id);
              } catch (error) {
                console.error("song failed", error);
                await sendMessage(chatId, "Bhai gala baith gaya 😅 thodi der baad try kar.");
              }
              await db.from("telegram_messages").insert({
                chat_id: chatId,
                chat_title: chatTitle,
                role: "assistant",
                text: `🎤 song: ${song} (${autotune ? "autotune" : "no autotune"})`,
                kind: "voice",
              });
              return Response.json({ ok: true, song: true });
            }
          }

          /* ---------- 3. Bolna hai ya nahi ---------- */
          if (!isPrivate && !mentioned && !repliedToBot && !command && !abusive) {
            return Response.json({ ok: true, silent: true });
          }
          if (!text.trim() && !message.photo) {
            return Response.json({ ok: true, silent: true });
          }

          const { data: relationRows } = await db
            .from("user_relations")
            .select("username, relation")
            .limit(100);
          const relations: RelationRow[] = (relationRows ?? []) as RelationRow[];
          const isRelative = relations.some(
            (r) => r.username.toLowerCase() === (username ?? "").toLowerCase(),
          );
          const beast = abusive && !isOwner && !isRelative;

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
          const decision = await decide(settings, isOwner, history, relations, beast);

          const replyTo = message.message_id as number | undefined;

          if (decision.want_voice && !decision.want_song) {
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

          /* ---------- Gaana maanga: naam + autotune pucho ---------- */
          if (decision.want_song) {
            await db.from("song_requests").insert({
              chat_id: chatId,
              user_id: fromId,
              username,
              stage: "awaiting_song",
              song: decision.song_query || null,
            });
          }

          /* ---------- Relation save ---------- */
          if (decision.save_relation) {
            await db.from("user_relations").upsert(
              {
                chat_id: chatId,
                username: decision.save_relation.username,
                relation: decision.save_relation.relation,
              },
              { onConflict: "username" },
            );
          }

          if (decision.want_image && decision.image_prompt) {
            try {
              await sendChatAction(chatId, "upload_photo");
              const png = await generateImage(decision.image_prompt);
              await sendPhoto(chatId, png, "Ye lo bhai 👇", replyTo);
            } catch (error) {
              console.error("image failed", error);
              await sendMessage(
                chatId,
                "Bhai image banane me dikkat aa gayi, thodi der baad try kar.",
                replyTo,
              );
            }
          }

          if (decision.lecture_issue) {
            await sendMessage(chatId, `@${owner} boss dekho iska lecture nahi chal raha hai 🙏`);
          }

          /* ---------- Moderation: owner se permission maango ---------- */
          if (decision.report && !isOwner && !isRelative) {
            const { data: warnRow } = await db
              .from("user_warnings")
              .select("count")
              .eq("chat_id", chatId)
              .eq("user_id", fromId)
              .maybeSingle();
            const warns = warnRow?.count ?? 0;
            const action = warns >= 2 || decision.report.action === "ban" ? "kick" : "warn";
            const who = username ? `@${username}` : (message.from?.first_name ?? "ye user");
            await db.from("pending_actions").insert({
              chat_id: chatId,
              target_user_id: fromId,
              target_username: username,
              action: decision.report.action === "ban" ? "ban" : action,
              reason: decision.report.reason,
              status: "pending",
            });
            const ask =
              action === "warn"
                ? `@${owner} boss ye ${who} bahut bol raha hai (${decision.report.reason}) — warn kar du? "haan" bolo to kar deta hoon.`
                : `@${owner} boss ${who} ko ${warns} warning de chuka hoon phir bhi nahi maan raha (${decision.report.reason}) — /kick kar du? "haan" bolo.`;
            await sendMessage(chatId, ask);
          }

          return Response.json({ ok: true });
        } catch (err) {
          // Always 200 so Telegram doesn't retry-storm this update.
          console.error("Telegram webhook error:", err);
          return Response.json({ ok: true, error: String(err) });
        }
      },
    },
  },
});
