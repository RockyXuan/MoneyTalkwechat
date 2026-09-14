> 历史归档，2026-09-14 起不再作为当前需求或执行规范。旧 iOS/微信路线与 GLM5.2 微信同步任务已作废。本文仅供理解旧代码/设计，不自动恢复其中的命令、部署步骤或 UI 要求。当前方向见 [Mac HTML/Cloudflare 交接](mac-html-cloudflare-handoff.md)。

# WorkBuddy GLM5.2 Handoff: WeChat Official Account Sync

## Goal

Next phase priority is **data sync between WeChat Official Account and the mini program**. Do not continue the broader UI redesign for now. The immediate goal is:

1. User binds the WeChat Official Account from the mini program.
2. User sends natural-language text or voice to the Official Account.
3. Backend parses the message into pending accounting records.
4. Mini program shows pending records for confirmation, including original text and replayable original voice when available.
5. User confirms or rejects inside the mini program; confirmed records become expenses/subscriptions through existing flows.

## Current State

This project is the mini-program version: `RockyXuan/MoneyTalkwechat`. Avoid the older `MoneyTalk` project.

Implemented in this handoff branch:

- WeChat webhook now routes by message type: text and voice.
- Text messages keep the existing binding and AI parsing flow.
- Voice messages support WeChat `Recognition` first, then fall back to existing ASR if recognition text is missing.
- Original WeChat voice media is downloaded by `MediaId` and uploaded to TOS/S3-compatible storage when credentials are configured.
- Pending records preserve voice metadata either in new `pending_records` columns or in a backward-compatible `parsed_data._source_media` fallback if the migration has not been applied yet.
- Mini program pending inbox recognizes voice records and can request the original audio through a backend media endpoint.
- Root pnpm scripts were adjusted to call `corepack pnpm`, which works in the current Windows/Codex environment.
- Added `.env.example` with all required Supabase, WeChat OA, TOS/S3, and API base URL variables.

Important files:

- `server/src/wechat/wechat.service.ts`: webhook routing, binding checks, text/voice parsing, pending record writes, migration fallback.
- `server/src/wechat/wechat-media.service.ts`: WeChat access token and temporary media download.
- `server/src/wechat/tos-media-storage.service.ts`: TOS/S3 upload and media stream retrieval.
- `server/src/wechat/wechat.controller.ts`: media playback endpoint.
- `src/store/expense-store.ts`: pending record media-field normalization.
- `src/pages/index/index.tsx`: pending inbox voice display and playback control.
- `server/migrations/20260601_add_pending_record_voice_media.sql`: recommended schema migration.
- `server/migrations/20260601_add_pending_record_voice_media.rollback.sql`: rollback migration.
- `server/scripts/wechat-fixture-smoke.js`: local fixture smoke test.
- `docs/wechat-voice-manual-test.md`: XML fixtures for manual webhook testing.

## Environment Setup

Create `.env.local` from `.env.example`. Do not commit `.env.local`.

Required values:

```env
COZE_SUPABASE_URL=
COZE_SUPABASE_ANON_KEY=
COZE_SUPABASE_SERVICE_ROLE_KEY=

WECHAT_OA_TOKEN=coze_bookkeeping_token
WECHAT_OA_APP_ID=
WECHAT_OA_APP_SECRET=

TOS_ENDPOINT=
TOS_REGION=auto
TOS_BUCKET=
TOS_ACCESS_KEY_ID=
TOS_SECRET_ACCESS_KEY=
TOS_FORCE_PATH_STYLE=true

PROJECT_DOMAIN=
```

`PROJECT_DOMAIN` must be the public backend origin used by the mini program, for example `https://example.com`. The WeChat Official Account webhook URL should be:

```text
https://example.com/api/wechat/webhook
```

Use `WECHAT_OA_TOKEN` as the webhook token in the WeChat Official Account console.

## Next Implementation Plan

1. Pull this branch from GitHub and install dependencies.
   - Recommended runtime: Node 22 LTS. Node 24 may cause native dependency issues with `better-sqlite3`.
   - Run `corepack pnpm install --frozen-lockfile --ignore-scripts` first if install scripts fail in the target environment.

2. Configure `.env.local`.
   - Fill Supabase URL/keys.
   - Fill WeChat OA app id/secret/token.
   - Fill TOS/S3 endpoint, bucket, and credentials.
   - Set `PROJECT_DOMAIN` to the public backend domain.

3. Apply the database migration.
   - Preferred: run `server/migrations/20260601_add_pending_record_voice_media.sql` in Supabase SQL editor or migration pipeline.
   - Rollback: use `server/migrations/20260601_add_pending_record_voice_media.rollback.sql`.
   - The code has fallback behavior before migration, but the migration is still recommended for queryability and cleaner data.

4. Validate local code paths.
   - Run `corepack pnpm validate`.
   - Run `corepack pnpm build:server`.
   - Run `corepack pnpm --filter server test:wechat-fixtures`.
   - Run `corepack pnpm run build:weapp`.
   - Run `corepack pnpm run build:web`.

5. Run real connectivity checks.
   - Start the backend with `.env.local`.
   - Verify Supabase can read/write `wechat_bindings` and `pending_records`.
   - Verify WeChat access token can be fetched.
   - Verify a test media upload/read round trip to TOS/S3.

6. Configure WeChat Official Account.
   - Set webhook URL to `${PROJECT_DOMAIN}/api/wechat/webhook`.
   - Set token to `WECHAT_OA_TOKEN`.
   - Enable voice recognition if available; the backend can fall back to ASR, but WeChat recognition gives faster text.

7. End-to-end test.
   - Generate binding code in mini program profile page.
   - Send `绑定 123456` to the Official Account.
   - Send text: `午饭 35 元`.
   - Send voice: `星巴克 28 元`.
   - Confirm both appear in mini program pending inbox.
   - Confirm text can be converted into an expense/subscription.
   - Confirm voice record shows transcript and original voice playback.
   - Confirm reject removes a pending record.

## Known Risks / Follow-ups

- Real migration has not been applied in this environment because no live Supabase credentials were available here.
- Real Official Account and TOS/S3 integration has not been tested here because no credentials/public domain were available.
- WeChat voice media may arrive as AMR/Speex. The current implementation stores the original format. If mini program playback fails for AMR/Speex, add server-side transcoding to MP3/M4A before upload.
- The project still uses `default_user`; do not expand into full multi-user login unless that becomes a separate product decision.
- Keep UI work paused. Only adjust mini-program UI when required for pending confirmation and voice playback.

## Verification Already Run

These commands passed before handoff:

```bash
corepack pnpm validate
corepack pnpm build:server
corepack pnpm --filter server test:wechat-fixtures
corepack pnpm run build:weapp
corepack pnpm run build:web
```

Warnings seen during build:

- Browserslist data is old. This is not blocking.
- Babel deoptimized `lucide-react-taro` because the generated file is larger than 500 KB. This is not blocking.

## Suggested First GLM5.2 Task

Start by applying `.env.local` and the Supabase migration, then run a live end-to-end test from WeChat Official Account to mini program pending inbox. Do not start UI redesign until the data path is verified.
