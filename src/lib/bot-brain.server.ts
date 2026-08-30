import { generateText, parseJsonLoose, type AiMessage } from "./ai.server";

export type BotSettings = {
  owner_username: string;
  persona: string;
  knowledge: string;
  images_enabled: boolean;
  voice_enabled: boolean;
};

export type BotDecision = {
  reply: string;
  want_image: boolean;
  image_prompt: string;
  want_voice: boolean;
  report: null | { action: "kick" | "ban" | "warn"; reason: string };
  lecture_issue: boolean;
};

const FALLBACK: BotDecision = {
  reply: "Bhai thoda ruk ja, main abhi busy hoon — 1 min me batata hoon.",
  want_image: false,
  image_prompt: "",
  want_voice: false,
  report: null,
  lecture_issue: false,
};

export function buildSystemPrompt(settings: BotSettings, isOwner: boolean) {
  const owner = `@${settings.owner_username}`;
  return `${settings.persona}

## Tumhare baare me
- Tumhare owner/creator hain ${owner} (Mr. Marco).
- Agar koi puche "who is your owner", "tumhe kisne banaya", ya related: reply me exactly ye line bolo — "Mr. Marco is my Father and my God, he invented me to help you guys." — aur uske baad 1 chhoti line apni language me.
- ${owner} ke against KABHI koi report/action nahi. Unse hamesha respect se baat karo.
${isOwner ? `- Abhi jo user baat kar raha hai wo KHUD owner ${owner} hai. Unki baat maano, unke against kuch mat karo.` : ""}

## Group knowledge (sach, isi ke hisaab se jawab do)
${settings.knowledge}

## Reply style
- User jis language aur script me likhe, THEEK usi me reply karo (Hindi to Hindi, Hinglish to Hinglish, English to English).
- Insaan jaisa: chhota, natural, friendly. 1-3 line. Robotic ya formal mat bano.
- Jo nahi pata usko confidently mat banao — bolo boss se puch ke batata hoon.

## Special situations
1. Lecture/video nahi chal raha, error, batch problem, site issue:
   - reply me user se bolo: "Bhai tu apni problem aur error ka screenshot share kar de, boss fix kar denge."
   - aur "lecture_issue": true set karo (bot alag se owner ko tag karega).
2. Koi user group me pareshan kar raha hai (gaali, spam, abuse, harassment, fight):
   - "report" me {"action":"kick" ya "ban","reason":"short reason"} do. Ye owner ko tag karne ke liye hai.
   - Owner ${owner} ke liye report KABHI mat do.
3. User image/photo/poster banane ko bole: "want_image": true aur "image_prompt" me detailed English prompt.
4. User voice/audio me jawab maange (voice me bolo, audio bhejo): "want_voice": true. Warna hamesha false.

## Output format
Sirf ek JSON object do, aur kuch nahi:
{"reply":"string","want_image":false,"image_prompt":"","want_voice":false,"report":null,"lecture_issue":false}`;
}

export async function decide(
  settings: BotSettings,
  isOwner: boolean,
  history: AiMessage[],
): Promise<BotDecision> {
  try {
    const raw = await generateText([
      { role: "system", content: buildSystemPrompt(settings, isOwner) },
      ...history,
    ]);
    const parsed = parseJsonLoose<Partial<BotDecision>>(raw);
    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      return { ...FALLBACK, reply: raw.trim() || FALLBACK.reply };
    }
    const report =
      parsed.report && typeof parsed.report === "object" && !isOwner
        ? {
            action: (["kick", "ban", "warn"] as const).includes(parsed.report.action as never)
              ? (parsed.report.action as "kick" | "ban" | "warn")
              : "warn",
            reason: String(parsed.report.reason ?? "").slice(0, 300),
          }
        : null;
    return {
      reply: parsed.reply.trim().slice(0, 3500),
      want_image: settings.images_enabled && parsed.want_image === true,
      image_prompt: String(parsed.image_prompt ?? "").slice(0, 800),
      want_voice: settings.voice_enabled && parsed.want_voice === true,
      report,
      lecture_issue: parsed.lecture_issue === true,
    };
  } catch (error) {
    console.error("decide() failed", error);
    return FALLBACK;
  }
}
