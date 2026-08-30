import { createHash } from "crypto";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const telegram = process.env["TELEGRAM_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!telegram) throw new Error("TELEGRAM_API_KEY is not configured");
  return { lovable, telegram };
}

export function telegramWebhookSecret(): string {
  const { telegram } = keys();
  return createHash("sha256").update(`telegram-webhook:${telegram}`).digest("base64url");
}

export async function tg<T = any>(method: string, body: Record<string, unknown>): Promise<T> {
  const { lovable, telegram } = keys();
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Telegram ${method} failed [${res.status}]: ${text}`);
    throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
  }
  const json = JSON.parse(text);
  if (json?.ok === false) {
    console.error(`Telegram ${method} error: ${text}`);
    throw new Error(`Telegram ${method} error: ${json.description ?? text}`);
  }
  return json.result as T;
}

async function tgForm(method: string, form: FormData) {
  const { lovable, telegram } = keys();
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
    },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Telegram ${method} failed [${res.status}]: ${text}`);
    throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
  }
  return JSON.parse(text);
}

export async function sendMessage(chatId: number, text: string, replyTo?: number) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
  });
}

export async function sendChatAction(chatId: number, action: string) {
  try {
    await tg("sendChatAction", { chat_id: chatId, action });
  } catch {
    /* non critical */
  }
}

export async function sendPhoto(
  chatId: number,
  png: Uint8Array,
  caption: string,
  replyTo?: number,
) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption.slice(0, 1000));
  if (replyTo) {
    form.append("reply_to_message_id", String(replyTo));
    form.append("allow_sending_without_reply", "true");
  }
  form.append("photo", new Blob([png as BlobPart], { type: "image/png" }), "image.png");
  return tgForm("sendPhoto", form);
}

export async function sendVoice(chatId: number, ogg: Uint8Array, replyTo?: number) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (replyTo) {
    form.append("reply_to_message_id", String(replyTo));
    form.append("allow_sending_without_reply", "true");
  }
  form.append("voice", new Blob([ogg as BlobPart], { type: "audio/ogg" }), "voice.ogg");
  return tgForm("sendVoice", form);
}

let cachedMe: { id: number; username: string } | null = null;
export async function getMe() {
  if (cachedMe) return cachedMe;
  const me = await tg<{ id: number; username: string }>("getMe", {});
  cachedMe = { id: me.id, username: me.username };
  return cachedMe;
}
