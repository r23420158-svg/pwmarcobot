const AI_BASE = "https://ai.gateway.lovable.dev/v1";

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

export async function generateText(messages: AiMessage[]): Promise<string> {
  const res = await gateway("/responses", {
    model: "openai/gpt-5.6-sol",
    input: messages,
  });
  const json = (await res.json()) as {
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  };
  const parts: string[] = [];
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const chunk of item.content ?? []) {
      if (chunk.type === "output_text" && chunk.text) parts.push(chunk.text);
    }
  }
  return parts.join("\n").trim();
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

export async function generateImage(prompt: string): Promise<Uint8Array> {
  const res = await gateway("/images/generations", {
    model: "google/gemini-3.1-flash-image",
    prompt,
    n: 1,
  });
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

export async function generateVoice(text: string): Promise<Uint8Array> {
  const res = await gateway("/audio/speech", {
    model: "openai/gpt-4o-mini-tts",
    voice: "onyx",
    input: text.slice(0, 900),
    response_format: "opus",
  });
  return new Uint8Array(await res.arrayBuffer());
}
