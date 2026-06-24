-- Rollback for 20260601_add_pending_record_voice_media.sql.
-- This removes only the voice-media columns and indexes added by that migration.

drop index if exists public.pending_records_wechat_media_id_idx;
drop index if exists public.pending_records_wechat_msg_id_idx;
drop index if exists public.pending_records_user_message_type_status_idx;

alter table public.pending_records
  drop column if exists media_expires_at,
  drop column if exists source_payload,
  drop column if exists transcription_source,
  drop column if exists media_size,
  drop column if exists media_content_type,
  drop column if exists media_object_key,
  drop column if exists media_format,
  drop column if exists wechat_media_id,
  drop column if exists wechat_msg_id,
  drop column if exists source_openid,
  drop column if exists source_message_type;
