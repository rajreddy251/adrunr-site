# Adrunr

Ads operations platform: marketing site (`/`, `/privacy`, `/terms`) plus an ops console at `/ops`.

This repo is the **single production codebase**. Behavior is ported from the validated MVP (`rajreddy251/adrunr` @ `493d52c`) and evolved onto **Neon Postgres + Prisma Schema v1.3** (provider-agnostic). There is no `.data/tokens.json` path.

## Safety (read first)

- Developer token is **Test Account** access until **Basic Access** is approved. Listing or mutating production accounts under MCC `857-080-5596` (red4code) will often fail until then.
- New Search campaigns are created **PAUSED**. Dry-run (`validateOnly`) is the default and preferred path.
- There is **no enable / go-live action**. A paused campaign cannot spend until it is enabled outside this app.
- **No spend without an explicit confirm.** Applying a paused create requires typing `CREATE PAUSED` (enforced server-side).
- Customer `485-651-7690` may return `CUSTOMER_NOT_ENABLED`. It is listed for visibility; **mutates against it are refused**.

Platform notes (not secrets): GCP project `adrunr-ads-ops`, MCC `857-080-5596`. Use a Test Account until Basic Access.

## Stack

- Next.js 15 App Router + TypeScript
- **Neon Postgres only** (no Vercel Postgres, no Supabase)
- **Prisma only** (Schema v1.3)
- Encrypted OAuth columns (`accessTokenEncrypted`, `refreshTokenEncrypted`) via `TOKEN_ENCRYPTION_KEY`
- TEXT payloads (`requestPayload`, `responsePayload`, `requestBody`, `responseBody`, `metadataText`) — **no JSONB**
- Official [`googleapis`](https://github.com/googleapis/google-api-nodejs-client) + Google Ads REST

## Schema v1.3

Core models: Organization, User, Membership, Invitation, Client, ClientMembership, AgentClientAssignment, Workspace, **IntegrationProvider**, OAuthConnection, **ExternalAccount**, ExternalEntity, CampaignOp, **SearchCampaignDraft**, **SearchAdGroupDraft**, **SearchKeywordDraft**, **SearchAdDraft**, **SearchTargetDraft**, DryRunJob, ChangeRequest, **SyncJob**, AuditEvent, RolePermission, **ClientRolePermission**.

Search drafts store the in-app wizard tree (campaign, ad groups, keywords, RSA, geo/language targeting). `CampaignOp.searchCampaignDraftId` and `CampaignOp.googleCampaignResourceName` are optional. `PermissionResource` includes `SEARCH_CAMPAIGN_DRAFT`. Audiences, schedules, devices, and tROAS bidding columns are schema-ready; Phase 2 apply uses Manual CPC + geo/language only.

`AgentClientAssignment` has Prisma relations to Organization, Client, and User (`onDelete: Cascade`). Client RBAC lives in `ClientRolePermission` and is not overloaded onto agency `RolePermission`.

`CampaignOpKind` values: `SEARCH_CREATE`, `PMAX_CREATE`, `DISPLAY_CREATE`, `META_CAMPAIGN_CREATE`, `TIKTOK_CAMPAIGN_CREATE`, `LINKEDIN_CAMPAIGN_CREATE`, `GENERIC_MUTATE`. Google still implements `SEARCH_CREATE` first; other kinds are schema-ready stubs.

Google-only `AdsAccount` / `Ga4Property` / `OAuthProvider` are gone. Ads customers, GA4 properties, and future Clarity/Meta/TikTok/LinkedIn/Heartza accounts share `ExternalAccount`.

Seeded providers (rows, not code paths):

| slug | name | category | Connect |
| --- | --- | --- | --- |
| `google_ads` | Google Ads | ADS | implemented |
| `google_analytics` | Google Analytics (GA4) | ANALYTICS | same Google grant / readonly stub |
| `microsoft_clarity` | Microsoft Clarity | HEATMAP | stub |
| `meta_ads` | Meta Ads | ADS | stub |
| `tiktok_ads` | TikTok Ads | ADS | stub |
| `linkedin_ads` | LinkedIn Ads | ADS | stub |
| `heartza` | Heartza | OTHER | stub |
| `custom` | Custom / future | OTHER | stub |

## Local setup

```bash
npm install
cp .env.example .env.local
# set DATABASE_URL to a Neon connection string
# set TOKEN_ENCRYPTION_KEY (openssl rand -hex 32) unless ADRUNR_MOCK=1
npx prisma migrate deploy
npx prisma db seed
ADRUNR_MOCK=1 npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (marketing) and [http://localhost:3000/ops](http://localhost:3000/ops).

`ADRUNR_MOCK=1` demos **Connect → list accounts → Search wizard (S0–S8) → validateOnly / Create PAUSED → audit trail** without live Google Ads. Tokens, drafts, and accounts still persist in Neon.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Neon Postgres connection string |
| `TOKEN_ENCRYPTION_KEY` | production | 32-byte key (64 hex chars or base64). Mock mode may omit |
| `GOOGLE_CLIENT_ID` | live OAuth | OAuth web client id (GCP `adrunr-ads-ops`) |
| `GOOGLE_CLIENT_SECRET` | live OAuth | OAuth web client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | live OAuth | Default `http://localhost:3000/api/auth/google/callback` |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | live Ads | Test Account token until Basic Access |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | recommended | MCC. Default `857-080-5596` |
| `GOOGLE_ADS_REFRESH_TOKEN` | optional | Seeded into `OAuthConnection` on first use (not a file) |
| `GOOGLE_ADS_API_VERSION` | optional | REST version, default `v19` |
| `GA4_PROPERTY_ID` | optional | GA4 Data API property. Soft-fails if unset |
| `APP_BASE_URL` | optional | Default `http://localhost:3000` |
| `ADRUNR_MOCK` | optional | `1` = local/CI demo, no live Google calls |

`.env.example` is the only env template in git. Never commit real secrets.

## Vercel + Neon deploy

1. Create a Neon project. Copy the connection string (`sslmode=require`).
2. Import this repo into Vercel. Framework preset: Next.js.
3. Set Vercel env vars: `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, Google OAuth + Ads vars, `APP_BASE_URL=https://<your-domain>`, `GOOGLE_OAUTH_REDIRECT_URI=https://<your-domain>/api/auth/google/callback`.
4. Add the same redirect URI to the GCP OAuth web client in project `adrunr-ads-ops`.
5. Build command can stay `next build`. Run migrations once (Vercel build command or a one-off):

```bash
npx prisma migrate deploy
npx prisma db seed
```

6. Do **not** set `ADRUNR_MOCK` in production.

Optional Vercel install/build override:

```bash
npm ci && npx prisma generate && npx prisma migrate deploy && npm run build
```

Seed RolePermission + ClientRolePermission + platform org + the eight IntegrationProvider rows after the first migrate.

## Google Cloud / Ads checklist

1. In GCP project `adrunr-ads-ops`, create an OAuth **Web application** client.
2. Authorized redirect URIs: local callback and the Vercel callback.
3. Enable the **Google Ads API**. Add the developer token from the MCC (`857-080-5596`) API Center.
4. Optional: enable **Google Analytics Data API** and set `GA4_PROPERTY_ID`.
5. Connect from `/ops`. Scopes requested: `adwords` + `analytics.readonly`.

## Flows

1. **Connect** — `/api/auth/google` starts the OAuth web flow (or mock connect). Callback writes encrypted tokens to `OAuthConnection` for `google_ads` (and `google_analytics` when the Analytics scope is present).
2. **List accounts** — `GET /api/ads/accounts` queries `customer_client` under the MCC, falls back to `listAccessibleCustomers`, upserts `ExternalAccount` rows, and writes a `SyncJob` + `AuditEvent`.
3. **Search wizard (Phase 2)** — `/ops` S0 account → S1 basics → S2 ad groups → S3 keywords → S4 RSA → S5 geo/language → S6 Manual CPC → S7 review → Validate / Create PAUSED → S8 result. Drafts persist as `SearchCampaignDraft` (+ child rows). Validate is a full-tree `validateOnly` dry-run. Apply is **PAUSED only** and requires `confirmPhrase` exactly `CREATE PAUSED`.
4. **Paused / dry-run shell (Phase 1)** — `POST /api/ads/campaigns` with `{ customerId, name, dailyBudgetMicros, dryRun, confirmPhrase }` still works. Always `status: PAUSED`. `dryRun` (default `true`) sets `validateOnly`. `dryRun: false` still creates PAUSED only and **requires** `confirmPhrase` exactly `CREATE PAUSED`. Persists `CampaignOp` + `DryRunJob` (and `ChangeRequest` on apply).
5. **GA4 stub** — `GET /api/ga4/report` runs a 7-day sessions + conversions sample and upserts a `google_analytics` ExternalAccount. Soft-fails if property id, scope, or API is missing.
6. **Other providers** — seeded only. Connect buttons are disabled stubs. There is **no Phase 3 AI suggest** in this app.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | production |
| `npm run db:setup` | `prisma migrate deploy` + seed |
| `npm test` | unit tests (safety, ids, crypto, schema locks) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next ESLint |
| `npm run check` | typecheck + test + lint |

CI runs those plus `npm run build` with `ADRUNR_MOCK=1` and a dummy `DATABASE_URL` for `prisma generate` (no live Neon required for CI compile).

## API sketch

- `GET /api/auth/status` — connection + seeded providers (no secrets)
- `GET /api/auth/google` — start OAuth (or mock connect)
- `GET /api/auth/google/callback` — exchange code, persist encrypted tokens
- `POST /api/auth/disconnect` — revoke `OAuthConnection` rows
- `GET /api/ads/accounts`
- `POST /api/ads/campaigns` — Phase 1 Search create shell
- `GET /api/ads/campaigns/:id` — CampaignOp + DryRunJob detail
- `GET|POST /api/ads/search/drafts`
- `GET|PATCH|PUT|DELETE /api/ads/search/drafts/:id`
- `POST /api/ads/search/drafts/:id/validate` — full-tree validateOnly
- `POST /api/ads/search/drafts/:id/apply` — PAUSED + `CREATE PAUSED`
- `GET /api/ads/search/drafts/:id/result`
- `GET /api/ga4/report`
- `GET /api/audit`
- `GET /api/providers`
- `GET /api/health`
