CREATE TABLE public.telegram_messages (
  id BIGSERIAL PRIMARY KEY,
  update_id BIGINT UNIQUE,
  chat_id BIGINT NOT NULL,
  chat_title TEXT,
  user_id BIGINT,
  username TEXT,
  first_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  text TEXT,
  kind TEXT NOT NULL DEFAULT 'text',
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tg_msgs_chat ON public.telegram_messages (chat_id, created_at DESC);

GRANT ALL ON public.telegram_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.telegram_messages_id_seq TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.moderation_reports (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  chat_title TEXT,
  user_id BIGINT,
  username TEXT,
  action TEXT NOT NULL DEFAULT 'warn',
  reason TEXT,
  message_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mod_reports_created ON public.moderation_reports (created_at DESC);

GRANT ALL ON public.moderation_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.moderation_reports_id_seq TO service_role;
ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bot_settings (
  id INT PRIMARY KEY DEFAULT 1,
  owner_username TEXT NOT NULL DEFAULT 'officialmarco22',
  persona TEXT NOT NULL DEFAULT '',
  knowledge TEXT NOT NULL DEFAULT '',
  images_enabled BOOLEAN NOT NULL DEFAULT true,
  voice_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bot_settings_singleton CHECK (id = 1)
);

GRANT ALL ON public.bot_settings TO service_role;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bot_settings (id, owner_username, persona, knowledge) VALUES (
  1,
  'officialmarco22',
  'Tum PW-MARCO ke group ke helper ho. Insaan ki tarah short, friendly, natural baat karo. User jis language/script me likhe usi me reply karo (Hindi, Hinglish, English, jo bhi). Emoji kabhi-kabhi, zyada nahi. Lambe lecture mat do.',
  'Website: PW-MARCO — https://pwmarco.info . Yaha sare courses bilkul free me milte hai. Agar website pe error aata hai to usually 5-10 minute me fix ho jata hai. Kisi batch me problem ho to developer screenshot dekh kar issue fix kar deta hai.'
);
