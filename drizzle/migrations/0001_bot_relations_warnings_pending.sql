CREATE TABLE public.user_relations (
  id bigserial PRIMARY KEY,
  chat_id bigint,
  username text NOT NULL,
  relation text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_relations_username_key ON public.user_relations (lower(username));
GRANT ALL ON public.user_relations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_relations_id_seq TO service_role;
ALTER TABLE public.user_relations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_warnings (
  id bigserial PRIMARY KEY,
  chat_id bigint NOT NULL,
  user_id bigint,
  username text,
  count integer NOT NULL DEFAULT 0,
  last_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_warnings_chat_user_key ON public.user_warnings (chat_id, user_id);
GRANT ALL ON public.user_warnings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_warnings_id_seq TO service_role;
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pending_actions (
  id bigserial PRIMARY KEY,
  chat_id bigint NOT NULL,
  target_user_id bigint,
  target_username text,
  action text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pending_actions_chat_idx ON public.pending_actions (chat_id, status, created_at DESC);
GRANT ALL ON public.pending_actions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pending_actions_id_seq TO service_role;
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.song_requests (
  id bigserial PRIMARY KEY,
  chat_id bigint NOT NULL,
  user_id bigint,
  username text,
  stage text NOT NULL DEFAULT 'awaiting_song',
  song text,
  autotune boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX song_requests_chat_idx ON public.song_requests (chat_id, created_at DESC);
GRANT ALL ON public.song_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.song_requests_id_seq TO service_role;
ALTER TABLE public.song_requests ENABLE ROW LEVEL SECURITY;
