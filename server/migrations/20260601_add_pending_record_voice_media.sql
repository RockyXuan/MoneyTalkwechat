-- Adds original WeChat voice metadata to pending_records.
-- Run this before deploying the WeChat voice webhook changes.

alter table public.pending_records
  add column if not exists source_message_type text,
  add column if not exists source_openid text,
  add column if not exists wechat_msg_id text,
  add column if not exists wechat_media_id text,
  add column if not exists media_format text,
  add column if not exists media_object_key text,
  add column if not exists media_content_type text,
  add column if not exists media_size integer,
  add column if not exists transcription_source text,
  add column if not exists source_payload jsonb,
  add column if not exists media_expires_at timestamptz;

create index if not exists pending_records_user_message_type_status_idx
  on public.pending_records (user_id, source_message_type, status);

create index if not exists pending_records_wechat_msg_id_idx
  on public.pending_records (wechat_msg_id)
  where wechat_msg_id is not null;

create index if not exists pending_records_wechat_media_id_idx
  on public.pending_records (wechat_media_id)
  where wechat_media_id is not null;
