const AI_BASE = "https://ai.gateway.lovable.dev/v1";
const XAI_BASE = "https://api.x.ai/v1";

function aiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

async function gateway(path: string, body: unknown) {
  const res = await fetch(`${AI_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`AI gateway ${path} failed [${res.status}]: ${detail}`);
    throw new Error(`AI request failed [${res.status}]: ${detail}`);
  }
  return res;
}

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

function textFromResponses(json: any): string {
  const parts: string[] = [];
  for (const item of json?.output ?? []) {
    if (item.type !== "message") continue;
    for (const chunk of item.content ?? []) {
      if (chunk.type === "output_text" && chunk.text) parts.push(chunk.text);
    }
  }
  return parts.join("\n").trim();
}

async function viaResponses(model: string, messages: AiMessage[]) {
  const res = await gateway("/responses", { model, input: messages });
  return textFromResponses(await res.json());
}

async function viaChat(model: string, messages: AiMessage[]) {
  const res = await gateway("/chat/completions", { model, messages });
  const json = (await res.json()) as any;
  return String(json?.choices?.[0]?.message?.content ?? "").trim();
}

async function viaGrok(messages: AiMessage[]) {
  const key = process.env["XAI_API_KEY"];
  if (!key) throw new Error("XAI_API_KEY not configured");
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "grok-3", messages }),
  });
  if (!res.ok) throw new Error(`Grok failed [${res.status}]: ${await res.text()}`);
  const json = (await res.json()) as any;
  return String(json?.choices?.[0]?.message?.content ?? "").trim();
}

/** Ordered fallback chain — agar ek model/credit fail ho to agla try hota hai. */
const TEXT_CHAIN: Array<{ name: string; run: (m: AiMessage[]) => Promise<string> }> = [
  { name: "openai/gpt-5.6-sol", run: (m) => viaResponses("openai/gpt-5.6-sol", m) },
  { name: "openai/gpt-5.6-terra", run: (m) => viaResponses("openai/gpt-5.6-terra", m) },
  { name: "google/gemini-3.7-flash", run: (m) => viaChat("google/gemini-3.7-flash", m) },
  { name: "google/gemini-3.1-flash-lite", run: (m) => viaChat("google/gemini-3.1-flash-lite", m) },
  { name: "grok-3", run: (m) => viaGrok(m) },
];

export async function generateText(
  messages: AiMessage[],
  opts?: { beast?: boolean },
): Promise<string> {
  const chain = opts?.beast
    ? [TEXT_CHAIN[TEXT_CHAIN.length - 1]!, ...TEXT_CHAIN.slice(0, -1)]
    : TEXT_CHAIN;
  let lastError: unknown = null;
  for (const step of chain) {
    try {
      const out = await step.run(messages);
      if (out) return out;
    } catch (error) {
      lastError = error;
      console.error(`text model ${step.name} failed, trying fallback`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All AI models failed");
}

export function parseJsonLoose<T>(raw: string): T | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

const IMAGE_MODELS = ["google/gemini-3.1-flash-image", "google/gemini-2.5-flash-image"];

export async function generateImage(prompt: string): Promise<Uint8Array> {
  let lastError: unknown = null;
  for (const model of IMAGE_MODELS) {
    try {
      const res = await gateway("/images/generations", { model, prompt, n: 1 });
      const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = json.data?.[0]?.b64_json;
      if (b64) return Uint8Array.from(Buffer.from(b64, "base64"));
    } catch (error) {
      lastError = error;
      console.error(`image model ${model} failed`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No image returned");
}

const VOICE_MODELS = ["openai/gpt-4o-mini-tts", "openai/tts-1"];

export async function generateVoice(
  text: string,
  opts?: { instructions?: string; voice?: string },
): Promise<Uint8Array> {
  let lastError: unknown = null;
  for (const model of VOICE_MODELS) {
    try {
      const res = await gateway("/audio/speech", {
        model,
        voice: model.includes("gpt-4o") ? (opts?.voice ?? "onyx") : "onyx",
        input: text.slice(0, 3500),
        response_format: "opus",
        ...(opts?.instructions && model.includes("gpt-4o")
          ? { instructions: opts.instructions }
          : {}),
      });
      return new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      lastError = error;
      console.error(`voice model ${model} failed`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Voice generation failed");
}

/** Gaana: pehle lyrics likhwao, phir singing-style TTS se voice note banao. */
export async function generateSong(
  song: string,
  autotune: boolean,
  language: string,
): Promise<{ lyrics: string; audio: Uint8Array }> {
  const lyrics = await generateText([
    {
      role: "system",
      content:
        "Tum ek playback singer ho. User jo gaana maange uske hisaab se 8-14 line ka gaana likho (agar famous gaana hai to usi ke mood/theme par apna version, copyright-safe). Sirf lyrics do, koi heading ya explanation nahi. Har line alag line me. Language: " +
        language,
    },
    { role: "user", content: `Gaana: ${song}` },
  ]);
  const clean = lyrics.replace(/^[#*>\-\s]+/gm, "").trim();
  const instructions = autotune
    ? "Sing this like a melodic autotuned pop/T-Pain style vocal: pitch-perfect, smooth glides, robotic shimmer on sustained notes, steady rhythm, musical phrasing with pauses between lines."
    : "Sing this warmly and soulfully like a live acoustic performance: natural human singing voice, expressive melody, breath between lines, no robotic effect.";
  const audio = await generateVoice(clean, {
    instructions,
    voice: autotune ? "ballad" : "verse",
  });
  return { lyrics: clean, audio };
}
