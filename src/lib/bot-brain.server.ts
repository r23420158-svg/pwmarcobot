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
  want_song: boolean;
  song_query: string;
  save_relation: null | { username: string; relation: string };
  report: null | { action: "kick" | "ban" | "warn"; reason: string };
  lecture_issue: boolean;
  abuse: boolean;
};

const FALLBACK: BotDecision = {
  reply: "Bhai thoda ruk ja, main abhi busy hoon — 1 min me batata hoon.",
  want_image: false,
  image_prompt: "",
  want_voice: false,
  want_song: false,
  song_query: "",
  save_relation: null,
  report: null,
  lecture_issue: false,
  abuse: false,
};

export type RelationRow = { username: string; relation: string };

export function buildSystemPrompt(
  settings: BotSettings,
  isOwner: boolean,
  relations: RelationRow[],
  beast: boolean,
) {
  const owner = `@${settings.owner_username}`;
  const relationText = relations.length
    ? relations.map((r) => `- @${r.username} => ${r.relation}`).join("\n")
    : "- (abhi koi relation save nahi hai)";
  return `${settings.persona}

## Tumhare baare me
- Tumhare owner/creator hain ${owner} (Mr. Marco).
- Agar koi puche "who is your owner", "tumhe kisne banaya", ya related: reply me exactly ye line bolo — "Mr. Marco is my Father and my God, he invented me to help you guys." — aur uske baad 1 chhoti line apni language me.
- ${owner} ke against KABHI koi report/action nahi. Unse hamesha respect se baat karo.
${isOwner ? `- Abhi jo user baat kar raha hai wo KHUD owner ${owner} hai. Unki baat maano.` : ""}

## Rishte (relations) — yaad rakho
${relationText}
- Jab in me se koi user baat kare, unhe unke rishte ke hisaab se sambodhit karo (jaise "uncle", "bhai", "didi") aur respect do.
- Sirf owner ${owner} hi naya rishta bana sakta hai. Agar owner bole "aaj se ye tumhara uncle hai" (kisi ko reply karke ya @username likh kar), to "save_relation": {"username":"...","relation":"uncle"} do aur pyaar se confirm karo.

## Group knowledge (sach, isi ke hisaab se jawab do)
${settings.knowledge}

## Reply style
- User jis language aur script me likhe, THEEK usi me reply karo.
- Insaan jaisa: chhota, natural, friendly. 1-3 line. Robotic mat bano.
${
  beast
    ? `## BEAST MODE ON 🔥
- Is user ne gaali/abuse ki hai. Ab tum Grok jaisa bebaak, informal, savage reply karte ho — jaisi bhasha usne use ki, waisi hi wapas (uske hi level pe, chhota aur karara).
- Tameez ki chinta nahi, par owner ${owner} aur upar diye gaye relation wale logon ke against kabhi nahi.
- Saath hi "abuse": true aur report bhi do.`
    : ""
}

## Special situations
1. Lecture/video nahi chal raha, error, batch problem: reply me bolo "Bhai tu apni problem aur error ka screenshot share kar de, boss fix kar denge." aur "lecture_issue": true.
2. Koi user gaali/spam/harassment kar raha hai: "report" me {"action":"warn" ya "kick" ya "ban","reason":"short reason"} do. Bot khud action nahi lega — owner se permission maangega. Owner ${owner} ke liye report KABHI nahi.
3. Image/poster banane ko bole: "want_image": true + "image_prompt" (English, detailed).
4. Voice/audio me jawab maange: "want_voice": true.
5. Gaana gaane ko bole (gaana suna, song sing karo, gaake sunao): "want_song": true aur "song_query" me gaane ka naam agar bataya ho warna khaali. Reply me pucho: "Boss kaun sa gana gau? Aur autotune ke sath ya bina autotune ke?"

## Output format
Sirf ek JSON object do, aur kuch nahi:
{"reply":"string","want_image":false,"image_prompt":"","want_voice":false,"want_song":false,"song_query":"","save_relation":null,"report":null,"lecture_issue":false,"abuse":false}`;
}

export async function decide(
  settings: BotSettings,
  isOwner: boolean,
  history: AiMessage[],
  relations: RelationRow[] = [],
  beast = false,
): Promise<BotDecision> {
  try {
    const raw = await generateText(
      [
        { role: "system", content: buildSystemPrompt(settings, isOwner, relations, beast) },
        ...history,
      ],
      { beast },
    );
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
    const rel =
      isOwner && parsed.save_relation && typeof parsed.save_relation === "object"
        ? {
            username: String(parsed.save_relation.username ?? "")
              .replace(/^@/, "")
              .slice(0, 64),
            relation: String(parsed.save_relation.relation ?? "").slice(0, 64),
          }
        : null;
    return {
      reply: parsed.reply.trim().slice(0, 3500),
      want_image: settings.images_enabled && parsed.want_image === true,
      image_prompt: String(parsed.image_prompt ?? "").slice(0, 800),
      want_voice: settings.voice_enabled && parsed.want_voice === true,
      want_song: settings.voice_enabled && parsed.want_song === true,
      song_query: String(parsed.song_query ?? "").slice(0, 200),
      save_relation: rel && rel.username && rel.relation ? rel : null,
      report,
      lecture_issue: parsed.lecture_issue === true,
      abuse: parsed.abuse === true,
    };
  } catch (error) {
    console.error("decide() failed", error);
    return FALLBACK;
  }
}

const ABUSE_WORDS = [
  "bhosdi",
  "bhosda",
  "madarchod",
  "madarchod",
  "mc",
  "bc",
  "behenchod",
  "bahenchod",
  "chutiya",
  "chutiye",
  "gandu",
  "gaandu",
  "lund",
  "lawda",
  "lauda",
  "randi",
  "harami",
  "kutte",
  "kamine",
  "fuck",
  "fucker",
  "bitch",
  "asshole",
  "bastard",
  "dick",
];

export function isAbusive(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z\u0900-\u097F\s]/g, " ")} `;
  const hindi = /(भोसड|मादरचोद|बहनचोद|चूतिया|गांडू|रंडी|हरामी|कुत्ते|कमीने)/.test(text);
  return hindi || ABUSE_WORDS.some((w) => t.includes(` ${w} `));
}

const YES = /^(ha+n?|haa+|yes|ya|yep|ok|okay|kar do|kardo|karde|kar de|sahi|theek|thik|yo|do it|go ahead|permission)\b/i;
const NO = /^(na+h?i+n?|no|nope|mat|rehne|rahne|chhod|chod do|leave|cancel)\b/i;

export function ownerSaysYes(text: string) {
  return YES.test(text.trim());
}
export function ownerSaysNo(text: string) {
  return NO.test(text.trim());
}
