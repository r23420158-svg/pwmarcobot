import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { loadDashboard, saveSettings, setupWebhook } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PW-MARCO Bot — Telegram AI Assistant Dashboard" },
      {
        name: "description",
        content:
          "Control panel for the PW-MARCO Telegram AI bot: live group messages, moderation reports and bot personality settings.",
      },
      { property: "og:title", content: "PW-MARCO Bot — Telegram AI Assistant" },
      {
        property: "og:description",
        content:
          "A human-like Telegram helper for the PW-MARCO community, with image replies, voice notes and instant owner alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type Data = Awaited<ReturnType<typeof loadDashboard>>;

const TABS = ["messages", "moderation", "settings"] as const;
type Tab = (typeof TABS)[number];

function Dashboard() {
  const load = useServerFn(loadDashboard);
  const save = useServerFn(saveSettings);
  const connectWebhook = useServerFn(setupWebhook);

  const [password, setPassword] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("messages");
  const [saved, setSaved] = useState("");
  const [whBusy, setWhBusy] = useState(false);
  const [whStatus, setWhStatus] = useState("");
  const [whError, setWhError] = useState("");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const [form, setForm] = useState({
    owner_username: "officialmarco22",
    persona: "",
    knowledge: "",
    images_enabled: true,
    voice_enabled: true,
  });

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await load({ data: { password } });
      setData(result);
      if (result.settings) {
        setForm({
          owner_username: result.settings.owner_username,
          persona: result.settings.persona,
          knowledge: result.settings.knowledge,
          images_enabled: result.settings.images_enabled,
          voice_enabled: result.settings.voice_enabled,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kuch galat ho gaya");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    try {
      setData(await load({ data: { password } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh fail");
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved("");
    try {
      await save({ data: { password, ...form } });
      setSaved("Settings save ho gayi ✅");
      await refresh();
    } catch (err) {
      setSaved(err instanceof Error ? err.message : "Save fail");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-5 py-16">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            PW-MARCO
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight text-foreground">
            Telegram AI Bot
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Group ka apna helper — insaan jaisa reply, image banaye, voice note bheje, aur koi
            pareshan kare to turant boss ko tag kare.
          </p>

          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            {[
              "Har language me natural reply",
              "AI image + voice message on demand",
              "Lecture/error complaint → owner ko instant tag",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>

          <form
            onSubmit={signIn}
            className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-lg"
          >
            <label className="text-sm font-medium text-card-foreground" htmlFor="pw">
              Owner dashboard password
            </label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Checking…" : "Open dashboard"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">PW-MARCO Bot</h1>
          <p className="text-sm text-muted-foreground">Owner control panel</p>
        </div>
        <button
          onClick={refresh}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          Refresh
        </button>
      </header>

      <nav className="mx-auto mt-6 flex max-w-5xl gap-1 rounded-xl border border-border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <section className="mx-auto mt-5 max-w-5xl">
        {tab === "messages" && (
          <div className="space-y-2">
            {data.messages.length === 0 && (
              <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Abhi koi message nahi. Bot ko group me add karke tag karo.
              </p>
            )}
            {data.messages.map((m) => (
              <article
                key={m.id}
                className={`rounded-xl border p-3 ${
                  m.role === "assistant"
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {m.role === "assistant"
                      ? "Bot"
                      : m.username
                        ? `@${m.username}`
                        : (m.first_name ?? "user")}
                  </span>
                  <span>{m.chat_title ?? m.chat_id}</span>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  {m.kind !== "text" && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                      {m.kind}
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{m.text}</p>
              </article>
            ))}
          </div>
        )}

        {tab === "moderation" && (
          <div className="space-y-2">
            {data.reports.length === 0 && (
              <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Abhi tak koi report nahi — group shaant hai 😌
              </p>
            )}
            {data.reports.map((r) => (
              <article key={r.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-destructive px-2 py-0.5 font-semibold uppercase text-destructive-foreground">
                    {r.action}
                  </span>
                  <span className="font-semibold text-foreground">
                    {r.username ? `@${r.username}` : r.user_id}
                  </span>
                  <span className="text-muted-foreground">{r.chat_title ?? r.chat_id}</span>
                  <span className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground">{r.reason}</p>
                {r.message_text && (
                  <p className="mt-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                    {r.message_text}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        {tab === "settings" && (
          <form onSubmit={onSave} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <label className="text-sm font-medium text-card-foreground">Owner username</label>
              <input
                value={form.owner_username}
                onChange={(e) => setForm({ ...form, owner_username: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-card-foreground">
                Bot personality (system prompt)
              </label>
              <textarea
                rows={5}
                value={form.persona}
                onChange={(e) => setForm({ ...form, persona: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-card-foreground">
                Group knowledge (website, rules, FAQ)
              </label>
              <textarea
                rows={6}
                value={form.knowledge}
                onChange={(e) => setForm({ ...form, knowledge: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ["images_enabled", "Image generation"],
                  ["voice_enabled", "Voice replies"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
            {saved && <p className="text-sm text-muted-foreground">{saved}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save settings"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
