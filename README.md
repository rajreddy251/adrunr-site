# Adrunr

Ads operations platform: marketing site (`/`, `/privacy`, `/terms`) plus an ops console at `/ops`.

This repo is the **single production codebase**. Behavior is ported from the validated MVP (`rajreddy251/adrunr` @ `493d52c`) and evolved onto **Neon Postgres + Prisma Schema v1.14** (provider-agnostic). There is no `.data/tokens.json` path.

## Safety (read first)

- Developer token is **Test Account** access until **Basic Access** is approved. Listing or mutating production accounts under MCC `857-080-5596` (red4code) will often fail until then.
- New Search, Display, Performance Max, Demand Gen, Video, Shopping, App, Hotel, Local, and Local Services campaigns are created **PAUSED**. Dry-run (`validateOnly`) is the default and preferred path.
- There is **no enable / go-live action**. A paused campaign cannot spend until it is enabled outside this app.
- **Listings sync is read-only.** `POST /api/ads/listings/sync` searches Google Ads (or mock fixtures) and optionally writes `SyncedCampaign` / `SyncedAdGroup` / `SyncedAd` / `SyncedKeyword` plus a `SyncJob`. It never enables, unpauses, or mutates live Ads status. Dry-run (preview, no cache write) is the default.
- **Metrics sync is read-only.** `POST /api/ads/metrics/sync` searches campaign budget + spend / cost metrics (or mock fixtures) and optionally writes `CampaignMetricSnapshot` plus a `SyncJob`. It never enables, unpauses, mutates live Ads status, or spends. Dry-run (preview, no cache write) is the default.
- **Safe campaign edit never enables spend.** `POST /api/ads/edits/drafts/:id/validate` is validateOnly first. Apply requires typing `EDIT SAFE` and only mutates name, budget, bids, or GEO/LANGUAGE targeting. Status `ENABLED` / enable / unpause / go-live are refused. Dry-run is the default in `/ops`.
- **No spend without an explicit confirm.** Applying a paused create requires typing `CREATE PAUSED` (enforced server-side). Applying a safe edit requires typing `EDIT SAFE`.
- Customer `485-651-7690` may return `CUSTOMER_NOT_ENABLED`. It is listed for visibility; **mutates against it are refused**.

Platform notes (not secrets): GCP project `adrunr-ads-ops`, MCC `857-080-5596`. Use a Test Account until Basic Access.

## Stack

- Next.js 15 App Router + TypeScript
- **Neon Postgres only** (no Vercel Postgres, no Supabase)
- **Prisma only** (Schema v1.14)
- Encrypted OAuth columns (`accessTokenEncrypted`, `refreshTokenEncrypted`) via `TOKEN_ENCRYPTION_KEY`
- TEXT payloads (`requestPayload`, `responsePayload`, `requestBody`, `responseBody`, `metadataText`) — **no JSONB**
- Official [`googleapis`](https://github.com/googleapis/google-api-nodejs-client) + Google Ads REST

## Schema v1.14

Core models: Organization, User, Membership, Invitation, Client, ClientMembership, AgentClientAssignment, Workspace, **IntegrationProvider**, OAuthConnection, **ExternalAccount**, ExternalEntity, CampaignOp, **SearchCampaignDraft**, **SearchAdGroupDraft**, **SearchKeywordDraft**, **SearchAdDraft**, **SearchTargetDraft**, **DisplayCampaignDraft**, **DisplayAdGroupDraft**, **DisplayAdDraft**, **DisplayAssetDraft**, **DisplayAudienceDraft**, **DisplayTargetDraft**, **PerformanceMaxCampaignDraft**, **PerformanceMaxAssetGroupDraft**, **PerformanceMaxAssetDraft**, **PerformanceMaxSignalDraft**, **PerformanceMaxListingDraft**, **PerformanceMaxTargetDraft**, **DemandGenCampaignDraft**, **DemandGenAdGroupDraft**, **DemandGenAdDraft**, **DemandGenAssetDraft**, **DemandGenAudienceDraft**, **DemandGenTargetDraft**, **VideoCampaignDraft**, **VideoAdGroupDraft**, **VideoAdDraft**, **VideoAssetDraft**, **VideoAudienceDraft**, **VideoTargetDraft**, **ShoppingCampaignDraft**, **ShoppingAdGroupDraft**, **ShoppingProductGroupDraft**, **ShoppingListingDraft**, **ShoppingTargetDraft**, **AppCampaignDraft**, **AppPlatformDraft**, **AppAdGroupDraft**, **AppAdDraft**, **AppAssetDraft**, **AppTargetDraft**, **HotelCampaignDraft**, **HotelAdGroupDraft**, **HotelListingDraft**, **HotelTargetDraft**, **LocalCampaignDraft**, **LocalLocationDraft**, **LocalAdGroupDraft**, **LocalAdDraft**, **LocalTargetDraft**, **LocalServicesCampaignDraft**, **LocalServicesCategoryDraft**, **LocalServicesTargetDraft**, **SyncedCampaign**, **SyncedAdGroup**, **SyncedAd**, **SyncedKeyword**, **CampaignMetricSnapshot**, **CampaignEditDraft**, **CampaignEditFieldDraft**, **CampaignEditBidDraft**, **CampaignEditTargetDraft**, DryRunJob, ChangeRequest, **SyncJob**, AuditEvent, RolePermission, **ClientRolePermission**, **AssistantThread**, **AssistantMessage**, **ClientMemory**.

Search drafts store the in-app wizard tree (campaign, ad groups, keywords, RSA, geo/language targeting). Display drafts store campaign, ad groups, responsive display ads/assets, geo, and remarketing audiences (`DisplayAudienceDraft` — not a separate campaign type). Performance Max drafts store campaign, asset groups (text + image assets), geo, search-theme signals, and optional listing-group rows (`PerformanceMaxListingDraft` — not a Sync listings product). Demand Gen drafts store campaign, ad groups, multi-asset ads/assets, geo, channel checkboxes, and USER_LIST audiences (`DemandGenAudienceDraft` — not a separate campaign type). Video drafts store campaign, ad groups, video responsive ads/YouTube assets, geo, format inventory checkboxes, and USER_LIST audiences (`VideoAudienceDraft` — not a separate campaign type). Shopping drafts store campaign, Merchant Center id, sales country / feed label, priority, ad groups, ALL_PRODUCTS product groups, optional listings, and geo (`ShoppingProductGroupDraft` / `ShoppingListingDraft` — not a Sync listings product). App drafts store campaign, Android / iOS platforms + app ids, install / download goal, ad groups, app ads/assets, and geo (`AppPlatformDraft` — mobile installs, not a Sync product). Hotel drafts store campaign, Hotel Center id, percent-CPC ceiling, ad groups, ALL_HOTELS listings, and geo (`HotelListingDraft` — UNIT stays stored). Local drafts store campaign, store-visit goal, business locations, ad groups, local ads, and geo (`LocalLocationDraft`). Local Services drafts store campaign, max lead bid, PRIMARY service categories, and geo (`LocalServicesCategoryDraft` — ADDITIONAL stays stored). `CampaignOp.searchCampaignDraftId`, `CampaignOp.displayCampaignDraftId`, `CampaignOp.pmaxCampaignDraftId`, `CampaignOp.demandGenCampaignDraftId`, `CampaignOp.videoCampaignDraftId`, `CampaignOp.shoppingCampaignDraftId`, `CampaignOp.appCampaignDraftId`, `CampaignOp.hotelCampaignDraftId`, `CampaignOp.localCampaignDraftId`, `CampaignOp.localServicesCampaignDraftId`, `CampaignOp.campaignEditDraftId`, and `CampaignOp.googleCampaignResourceName` are optional. `PermissionResource` includes `SEARCH_CAMPAIGN_DRAFT`, `DISPLAY_CAMPAIGN_DRAFT`, `PERFORMANCE_MAX_CAMPAIGN_DRAFT`, `DEMAND_GEN_CAMPAIGN_DRAFT`, `VIDEO_CAMPAIGN_DRAFT`, `SHOPPING_CAMPAIGN_DRAFT`, `APP_CAMPAIGN_DRAFT`, `HOTEL_CAMPAIGN_DRAFT`, `LOCAL_CAMPAIGN_DRAFT`, `LOCAL_SERVICES_CAMPAIGN_DRAFT`, `SYNCED_CAMPAIGN`, `CAMPAIGN_METRIC_SNAPSHOT`, and `CAMPAIGN_EDIT_DRAFT`. Schema v1.12 extends the existing `SyncJob` (`readOnly`, `dryRun`, `jobType: sync_listings`) and adds a live-listings cache (`SyncedCampaign` + children). `ExternalEntityType` gains `KEYWORD`. Schema v1.13 adds `CampaignMetricSnapshot` (typed budget + spend / cost metrics; `jobType: sync_metrics`) and reuses `SyncJob`. Schema v1.14 adds `CampaignEditDraft` (typed name / budget / bid / GEO+LANGUAGE children; `CampaignOpKind: CAMPAIGN_EDIT`). Import-to-drafts and richer performance reports stay out of scope. Display apply uses Manual CPC + geo + optional USER_LIST remarketing. Performance Max apply uses Maximize conversions + geo + SEARCH_THEME signals; ALL_PRODUCTS listings apply only when `merchantCenterId` is set. Demand Gen apply uses Maximize conversions + geo + USER_LIST audiences + selected Demand Gen channels. Video apply uses Manual CPV + geo + USER_LIST audiences + videoAdInventoryControl formats. Shopping apply uses Manual CPC + geo + Merchant Center + ALL_PRODUCTS product groups. App apply uses TARGET_CPA + INSTALLS + the first included Android (or iOS) app id; in-app actions / Maximize conversions / tROAS stay stored. Hotel apply uses PERCENT_CPC + Hotel Center + ALL_HOTELS. Local apply uses MAXIMIZE_CONVERSIONS + STORE_VISITS + a location + one local ad. Local Services apply uses MANUAL_CPC + PRIMARY category + max lead bid.

Assistant threads are tenant + client scoped (`orgId`, `clientId`, optional `draftId` for Search, `displayDraftId` for Display, `pmaxDraftId` for Performance Max, `demandGenDraftId` for Demand Gen, `videoDraftId` for Video, `shoppingDraftId` for Shopping, `appDraftId` for App, `hotelDraftId` for Hotel, `localDraftId` for Local, and `localServicesDraftId` for Local Services). Messages store `role` + `content` + optional `metadataText`. `ClientMemory` keeps short facts (`clientId`, `key`, `value`, `source`) from prior chats. AI draft patches write `AuditEvent` rows (`assistant.draft_patched`) against the active Search, Display, Performance Max, Demand Gen, Video, Shopping, App, Hotel, Local, or Local Services draft. TEXT only — no JSONB.

`AgentClientAssignment` has Prisma relations to Organization, Client, and User (`onDelete: Cascade`). Client RBAC lives in `ClientRolePermission` and is not overloaded onto agency `RolePermission`.

`CampaignOpKind` values: `SEARCH_CREATE`, `PMAX_CREATE`, `DISPLAY_CREATE`, `META_CAMPAIGN_CREATE`, `TIKTOK_CAMPAIGN_CREATE`, `LINKEDIN_CAMPAIGN_CREATE`, `GENERIC_MUTATE`, `DEMAND_GEN_CREATE`, `VIDEO_CREATE`, `SHOPPING_CREATE`, `APP_CREATE`, `HOTEL_CREATE`, `LOCAL_CREATE`, `LOCAL_SERVICES_CREATE`, `CAMPAIGN_EDIT`. Google implements `SEARCH_CREATE`, `DISPLAY_CREATE`, `PMAX_CREATE`, `DEMAND_GEN_CREATE`, `VIDEO_CREATE`, `SHOPPING_CREATE`, `APP_CREATE`, `HOTEL_CREATE`, `LOCAL_CREATE`, `LOCAL_SERVICES_CREATE`, and `CAMPAIGN_EDIT`. Other kinds are schema-ready stubs. Phase 1 `POST /api/ads/campaigns` stays Search-only.

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

`ADRUNR_MOCK=1` demos **Connect → list accounts → read-only listings sync (dry-run preview or cache) → read-only budget/spend snapshots (dry-run preview or cache) → safe campaign edit (validateOnly / EDIT SAFE) → Search (S0–S8), Display (D0–D6), Performance Max (P0–P6), Demand Gen (G0–G6), Video (V0–V6), Shopping (H0–H6), App (A0–A6), Hotel (T0–T6), Local (L0–L6), or Local Services (S0–S6) wizard + fill-first assistant → validateOnly / Create PAUSED → audit trail** without live Google Ads or an LLM key. Tokens, drafts, threads, synced listings, metric snapshots, edit drafts, and accounts still persist in Neon.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Neon Postgres connection string |
| `TOKEN_ENCRYPTION_KEY` | production | 32-byte key (64 hex chars or base64). Encrypt and decrypt use this same env var. Keep it stable — a mismatch makes stored tokens undecryptable until you restore the key or reconnect Google Ads. Mock mode may omit |
| `GOOGLE_CLIENT_ID` | live OAuth | OAuth web client id (GCP `adrunr-ads-ops`) |
| `GOOGLE_CLIENT_SECRET` | live OAuth | OAuth web client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | live OAuth | Default `http://localhost:3000/api/auth/google/callback` |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | live Ads | Test Account token until Basic Access |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | recommended | MCC. Default `857-080-5596` |
| `GOOGLE_ADS_REFRESH_TOKEN` | optional | Seeded into `OAuthConnection` on first use (not a file) |
| `GOOGLE_ADS_API_VERSION` | optional | REST version, default `v19` |
| `GA4_PROPERTY_ID` | optional | GA4 Data API property. Soft-fails if unset |
| `APP_BASE_URL` | optional | Default `http://localhost:3000` |
| `ADRUNR_MOCK` | optional | `1` = local/CI demo, no live Google or LLM calls |
| `ADRUNR_LLM_API_KEY` | live assistant | Server-side LLM key (never commit). Mock mode ignores this |
| `ADRUNR_LLM_BASE_URL` | live assistant | OpenAI-compatible chat completions base. Default `https://ai-gateway.vercel.sh/v1` |
| `ADRUNR_LLM_MODEL` | live assistant | Model id. Default `openai/gpt-5.4` |

`.env.example` is the only env template in git. Never commit real secrets.

## Vercel + Neon deploy

1. Create a Neon project. Copy the connection string (`sslmode=require`).
2. Import this repo into Vercel. Framework preset: Next.js.
3. Set Vercel env vars: `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, Google OAuth + Ads vars, `APP_BASE_URL=https://<your-domain>`, `GOOGLE_OAUTH_REDIRECT_URI=https://<your-domain>/api/auth/google/callback`. Keep `TOKEN_ENCRYPTION_KEY` stable across environments that share the same Neon database. A new key cannot decrypt existing `accessTokenEncrypted` / `refreshTokenEncrypted` rows — restore the previous key or Disconnect + Connect Google Ads.
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
3. **Listings sync (P0, read-only)** — `/ops` Synced listings. `GET /api/ads/listings` returns the Neon cache. `POST /api/ads/listings/sync` with `{ customerId, dryRun }` (default `dryRun: true`) searches campaigns / ad groups / ads / keywords via Google Ads GAQL (or `ADRUNR_MOCK` fixtures), writes a `SyncJob` (`jobType: sync_listings`, `readOnly: true`), and only persists `Synced*` + `ExternalEntity` when `dryRun` is false. Never calls `googleAds:mutate`. Never enables or unpauses live Ads. Cached `ENABLED` is a snapshot only.
4. **Metrics sync (P1, read-only)** — `/ops` Budget & spend snapshots for the selected customer. `GET /api/ads/metrics` returns Neon `CampaignMetricSnapshot` rows. `POST /api/ads/metrics/sync` with `{ customerId, dryRun, dateFrom?, dateTo? }` (default `dryRun: true`, last 7 days) searches campaign budget + spend / cost metrics via GAQL (or `ADRUNR_MOCK` fixtures), writes a `SyncJob` (`jobType: sync_metrics`, `readOnly: true`), and only persists snapshots when `dryRun` is false. Never calls `googleAds:mutate`. Never enables, unpauses, or spends. Cached spend is observational only.
5. **Safe campaign edit (P2)** — `/ops` Safe campaign edit against synced / cached campaigns. `GET|POST /api/ads/edits/drafts` stores a `CampaignEditDraft` (TEXT children for field kinds, bids, GEO/LANGUAGE). Validate is `validateOnly`. Apply requires `confirmPhrase` exactly `EDIT SAFE` and mutates name / budget / bids / targeting-safe fields only. Status `ENABLED`, enable, unpause, and go-live are refused. Dry-run is the default. `ADRUNR_MOCK=1` validates or pretends to apply locally — no live spend.
6. **Search wizard (Phase 2)** — `/ops` S0 account → S1 basics → S2 ad groups → S3 keywords → S4 RSA → S5 geo/language → S6 Manual CPC → S7 review → Validate / Create PAUSED → S8 result. Drafts persist as `SearchCampaignDraft` (+ child rows). Validate is a full-tree `validateOnly` dry-run. Apply is **PAUSED only** and requires `confirmPhrase` exactly `CREATE PAUSED`.
7. **Display wizard** — `/ops` Display tab D0 account → D1 basics → D2 creatives/assets → D3 audiences/geo → D4 bidding → D5 review → Validate / Create PAUSED → D6 result. Drafts persist as `DisplayCampaignDraft` (+ ad groups, ads/assets, audiences, geo). Remarketing is a Display `USER_LIST` audience, not a campaign type. Same PAUSED + `CREATE PAUSED` rules. No enable path.
8. **Performance Max wizard** — `/ops` Performance Max tab P0 account → P1 basics → P2 asset group → P3 signals/geo/listings → P4 bidding → P5 review → Validate / Create PAUSED → P6 result. Drafts persist as `PerformanceMaxCampaignDraft` (+ asset groups, assets, signals, optional listings, geo). Apply uses Maximize conversions. ALL_PRODUCTS listings apply only with a Merchant Center id; Sync listings is out of scope. Same PAUSED + `CREATE PAUSED` rules. No enable path.
9. **Demand Gen wizard** — `/ops` Demand Gen tab G0 account → G1 basics/channels → G2 creatives/assets → G3 audiences/geo → G4 bidding → G5 review → Validate / Create PAUSED → G6 result. Drafts persist as `DemandGenCampaignDraft` (+ ad groups, multi-asset ads/assets, audiences, geo, channel checkboxes). Apply uses Maximize conversions + USER_LIST audiences. Same PAUSED + `CREATE PAUSED` rules. No enable path.
10. **Video wizard** — `/ops` Video tab V0 account → V1 basics/formats → V2 creatives/YouTube assets → V3 audiences/geo → V4 bidding → V5 review → Validate / Create PAUSED → V6 result. Drafts persist as `VideoCampaignDraft` (+ ad groups, video responsive ads/YouTube assets, audiences, geo, format inventory). Apply uses Manual CPV + USER_LIST audiences. Same PAUSED + `CREATE PAUSED` rules. No enable path.
11. **Shopping wizard** — `/ops` Shopping tab H0 account → H1 basics/Merchant Center → H2 product groups/listings → H3 geo → H4 bidding → H5 review → Validate / Create PAUSED → H6 result. Drafts persist as `ShoppingCampaignDraft` (+ ad groups, ALL_PRODUCTS product groups, optional listings, geo, Merchant Center / sales country / priority). Apply uses Manual CPC + Merchant Center + ALL_PRODUCTS. UNIT / SUBDIVISION and tROAS stay stored. Same PAUSED + `CREATE PAUSED` rules. No enable path.
12. **App wizard** — `/ops` App tab A0 account → A1 basics/goal/CPI → A2 app/platforms → A3 creatives → A4 geo → A5 review → Validate / Create PAUSED → A6 result. Drafts persist as `AppCampaignDraft` (+ platforms/app ids, ad groups, app ads/assets, geo, INSTALLS goal). Apply uses TARGET_CPA + INSTALLS + the first included Android (or iOS) app id. In-app actions / Maximize conversions / tROAS stay stored. Same PAUSED + `CREATE PAUSED` rules. No enable path.
13. **Hotel wizard** — `/ops` Hotel tab T0 account → T1 basics/Hotel Center → T2 ad group + ALL_HOTELS → T3 geo → T4 bidding → T5 review → Validate / Create PAUSED → T6 result. Drafts persist as `HotelCampaignDraft` (+ ad groups, ALL_HOTELS listings, geo, Hotel Center / percent-CPC ceiling). Apply uses PERCENT_CPC + Hotel Center + ALL_HOTELS. UNIT / COMMISSION / MANUAL_CPC / tROAS stay stored. Same PAUSED + `CREATE PAUSED` rules. No enable path.
14. **Local wizard** — `/ops` Local tab L0 account → L1 basics/goal → L2 location → L3 ad → L4 geo → L5 review → Validate / Create PAUSED → L6 result. Drafts persist as `LocalCampaignDraft` (+ locations, ad groups, local ads, geo, STORE_VISITS). Apply uses MAXIMIZE_CONVERSIONS + STORE_VISITS + a location + one ad. STORE_SALES stays stored. Same PAUSED + `CREATE PAUSED` rules. No enable path.
15. **Local Services wizard** — `/ops` Local Services tab S0 account → S1 basics/bid → S2 PRIMARY category → S3 geo → S4 credentials → S5 review → Validate / Create PAUSED → S6 result. Drafts persist as `LocalServicesCampaignDraft` (+ PRIMARY categories, geo, max lead bid). Apply uses MANUAL_CPC + PRIMARY category. ADDITIONAL categories stay stored. Same PAUSED + `CREATE PAUSED` rules. No enable path.
16. **Wizard assistant** — panel beside Search, Display, Performance Max, Demand Gen, Video, Shopping, App, Hotel, Local, or Local Services. Paste a URL or brief; the turn builds a client-scoped context pack (org, client, ExternalAccounts, ExternalEntity/Search/Display/PMax/Demand Gen/Video/Shopping/App/Hotel/Local/Local Services drafts, current draft, thread, ClientMemory) and either patches draft fields and/or asks gap questions. Fill first — not a questionnaire. Chat **cannot** Validate, Apply, or enable and never calls those endpoints. `kind: "HOTEL"`, `kind: "LOCAL"`, and `kind: "LOCAL_SERVICES"` are required on `/api/assistant/threads` and `/api/assistant/turn` so those drafts bind `hotelDraftId` / `localDraftId` / `localServicesDraftId` and do not fall through to Search. `ADRUNR_MOCK=1` uses a heuristic fill when no LLM key is set.
17. **Paused / dry-run shell (Phase 1)** — `POST /api/ads/campaigns` with `{ customerId, name, dailyBudgetMicros, dryRun, confirmPhrase }` still works. Always `status: PAUSED`. `dryRun` (default `true`) sets `validateOnly`. `dryRun: false` still creates PAUSED only and **requires** `confirmPhrase` exactly `CREATE PAUSED`. Persists `CampaignOp` + `DryRunJob` (and `ChangeRequest` on apply). Search-only.
18. **GA4 stub** — `GET /api/ga4/report` runs a 7-day sessions + conversions sample and upserts a `google_analytics` ExternalAccount. Soft-fails if property id, scope, or API is missing.
19. **Other providers** — seeded only. Connect buttons are disabled stubs.

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
- `GET /api/ads/listings` — cached SyncedCampaign tree + last SyncJob
- `POST /api/ads/listings/sync` — read-only pull; `dryRun` default true (preview, no cache write)
- `GET /api/ads/metrics` — cached CampaignMetricSnapshot rows + last SyncJob
- `POST /api/ads/metrics/sync` — read-only budget/spend pull; `dryRun` default true (preview, no cache write)
- `GET|POST /api/ads/edits/drafts` — safe edit drafts from synced / cached campaigns
- `GET|PATCH|PUT|DELETE /api/ads/edits/drafts/:id`
- `POST /api/ads/edits/drafts/:id/validate` — validateOnly safe edit (name / budget / bids / GEO+LANGUAGE)
- `POST /api/ads/edits/drafts/:id/apply` — `EDIT SAFE` confirm; refuses ENABLE / unpause / go-live
- `GET /api/ads/edits/drafts/:id/result`
- `POST /api/ads/campaigns` — Phase 1 Search create shell
- `GET /api/ads/campaigns/:id` — CampaignOp + DryRunJob detail
- `GET|POST /api/ads/search/drafts`
- `GET|PATCH|PUT|DELETE /api/ads/search/drafts/:id`
- `POST /api/ads/search/drafts/:id/validate` — full-tree validateOnly
- `POST /api/ads/search/drafts/:id/apply` — PAUSED + `CREATE PAUSED`
- `GET /api/ads/search/drafts/:id/result`
- `GET|POST /api/ads/display/drafts`
- `GET|PATCH|PUT|DELETE /api/ads/display/drafts/:id`
- `POST /api/ads/display/drafts/:id/validate` — full-tree validateOnly
- `POST /api/ads/display/drafts/:id/apply` — PAUSED + `CREATE PAUSED`
- `GET /api/ads/display/drafts/:id/result`
- `GET|POST /api/ads/pmax/drafts`
- `GET|PATCH|PUT|DELETE /api/ads/pmax/drafts/:id`
- `POST /api/ads/pmax/drafts/:id/validate` — full-tree validateOnly
- `POST /api/ads/pmax/drafts/:id/apply` — PAUSED + `CREATE PAUSED`
- `GET /api/ads/pmax/drafts/:id/result`
- `GET|POST /api/ads/demand-gen/drafts`
- `GET|PATCH|PUT|DELETE /api/ads/demand-gen/drafts/:id`
- `POST /api/ads/demand-gen/drafts/:id/validate` — full-tree validateOnly
- `POST /api/ads/demand-gen/drafts/:id/apply` — PAUSED + `CREATE PAUSED`
- `GET /api/ads/demand-gen/drafts/:id/result`
- `GET|POST /api/ads/video/drafts`
- `GET|PATCH|PUT|DELETE /api/ads/video/drafts/:id`
- `POST /api/ads/video/drafts/:id/validate` — full-tree validateOnly
- `POST /api/ads/video/drafts/:id/apply` — PAUSED + `CREATE PAUSED`
- `GET /api/ads/video/drafts/:id/result`
- `GET|POST /api/ads/shopping/drafts`
- `GET|PATCH|PUT|DELETE /api/ads/shopping/drafts/:id`
- `POST /api/ads/shopping/drafts/:id/validate` — full-tree validateOnly
- `POST /api/ads/shopping/drafts/:id/apply` — PAUSED + `CREATE PAUSED`
- `GET /api/ads/shopping/drafts/:id/result`
- `GET|POST /api/ads/app/drafts`
- `GET|PATCH|PUT|DELETE /api/ads/app/drafts/:id`
- `POST /api/ads/app/drafts/:id/validate` — full-tree validateOnly
- `POST /api/ads/app/drafts/:id/apply` — PAUSED + `CREATE PAUSED`
- `GET /api/ads/app/drafts/:id/result`
- `GET|POST /api/assistant/threads` — client/draft scoped threads (`kind` + `draftId` bind Search / Display / PMax / Demand Gen / Video / Shopping / App)
- `GET /api/assistant/threads/:id`
- `GET|POST /api/assistant/threads/:id/messages`
- `POST /api/assistant/turn` — context pack → fill draft and/or ask gaps (no validate/apply)
- `GET /api/ga4/report`
- `GET /api/audit`
- `GET /api/providers`
- `GET /api/health`
