import { digitsOnly } from "./ids";
import { LISTINGS_SYNC_READ_ONLY_NOTE, resolveDryRun } from "./safety";
import type {
  ListingSyncCounts,
  SyncedAdGroupView,
  SyncedAdView,
  SyncedCampaignView,
  SyncedKeywordView,
} from "./types";

export const LISTINGS_SYNC_JOB_TYPE = "sync_listings";

export const CAMPAIGN_SEARCH_QUERY = `
  SELECT
    campaign.id,
    campaign.resource_name,
    campaign.name,
    campaign.status,
    campaign.serving_status,
    campaign.advertising_channel_type,
    campaign.bidding_strategy_type
  FROM campaign
`.trim();

export const AD_GROUP_SEARCH_QUERY = `
  SELECT
    ad_group.id,
    ad_group.resource_name,
    ad_group.name,
    ad_group.status,
    ad_group.type,
    ad_group.campaign
  FROM ad_group
`.trim();

export const AD_SEARCH_QUERY = `
  SELECT
    ad_group_ad.ad.id,
    ad_group_ad.resource_name,
    ad_group_ad.status,
    ad_group_ad.ad_group,
    ad_group_ad.ad.type,
    ad_group_ad.ad.name,
    ad_group_ad.ad.final_urls,
    ad_group_ad.ad.responsive_search_ad.headlines,
    ad_group_ad.ad.responsive_search_ad.descriptions
  FROM ad_group_ad
`.trim();

export const KEYWORD_SEARCH_QUERY = `
  SELECT
    ad_group_criterion.criterion_id,
    ad_group_criterion.resource_name,
    ad_group_criterion.status,
    ad_group_criterion.negative,
    ad_group_criterion.ad_group,
    ad_group_criterion.keyword.text,
    ad_group_criterion.keyword.match_type
  FROM ad_group_criterion
  WHERE ad_group_criterion.type = 'KEYWORD'
`.trim();

export type ListingsSyncInput = {
  customerId: string;
  dryRun: boolean;
};

export function assertListingsSyncReadOnly(body: Record<string, unknown>): void {
  const mutateKeys = ["mutateOperations", "mutate", "enable", "goLive", "unpause"];
  for (const key of mutateKeys) {
    const value = body[key];
    if (value === true || (Array.isArray(value) && value.length > 0) || (value && typeof value === "object")) {
      throw Object.assign(new Error(LISTINGS_SYNC_READ_ONLY_NOTE), {
        status: 400,
        info: { kind: "sync_read_only", hint: "Remove mutate/enable fields. Sync only searches Google Ads." },
      });
    }
  }
  const status = String(body.status ?? "").toUpperCase();
  if (status === "ENABLED" && (body.apply === true || body.persistStatus === true)) {
    throw Object.assign(new Error(LISTINGS_SYNC_READ_ONLY_NOTE), {
      status: 400,
      info: { kind: "sync_read_only", hint: "Sync cannot apply ENABLED. Cached status is a snapshot only." },
    });
  }
}

export function parseListingsSyncInput(body: unknown): ListingsSyncInput {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  assertListingsSyncReadOnly(record);
  const customerId = digitsOnly(String(record.customerId ?? ""));
  if (!customerId) {
    throw Object.assign(new Error("customerId is required."), {
      status: 400,
      info: { kind: "validation", hint: "Select an Ads customer, then sync." },
    });
  }
  return {
    customerId,
    dryRun: resolveDryRun(record.dryRun),
  };
}

export function countListings(campaigns: SyncedCampaignView[]): ListingSyncCounts {
  let adGroups = 0;
  let ads = 0;
  let keywords = 0;
  for (const campaign of campaigns) {
    adGroups += campaign.adGroups.length;
    for (const group of campaign.adGroups) {
      ads += group.ads.length;
      keywords += group.keywords.length;
    }
  }
  return { campaigns: campaigns.length, adGroups, ads, keywords };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function lastResourceId(resourceName: unknown): string {
  const text = String(resourceName ?? "");
  const parts = text.split("/");
  const tail = parts[parts.length - 1] ?? "";
  return tail.includes("~") ? (tail.split("~").pop() ?? tail) : tail;
}

function textFromAssetList(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return String(value);
  const parts = value
    .map((item) => {
      if (typeof item === "string") return item;
      const record = asRecord(item);
      return String(record.text ?? record.assetText ?? "");
    })
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

function firstUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.length > 0);
    return typeof first === "string" ? first : null;
  }
  return null;
}

export function mapLiveSearchRowsToCampaigns(input: {
  campaignRows: Array<Record<string, unknown>>;
  adGroupRows: Array<Record<string, unknown>>;
  adRows: Array<Record<string, unknown>>;
  keywordRows: Array<Record<string, unknown>>;
}): SyncedCampaignView[] {
  const adGroupsByCampaign = new Map<string, SyncedAdGroupView[]>();
  const adsByAdGroup = new Map<string, SyncedAdView[]>();
  const keywordsByAdGroup = new Map<string, SyncedKeywordView[]>();

  for (const row of input.adRows) {
    const adGroupAd = asRecord(row.adGroupAd);
    const ad = asRecord(adGroupAd.ad);
    const rsa = asRecord(ad.responsiveSearchAd);
    const adGroupId = lastResourceId(adGroupAd.adGroup);
    const externalId = String(ad.id ?? lastResourceId(adGroupAd.resourceName));
    if (!adGroupId || !externalId) continue;
    const view: SyncedAdView = {
      externalId,
      resourceName: adGroupAd.resourceName ? String(adGroupAd.resourceName) : null,
      name: ad.name ? String(ad.name) : null,
      type: ad.type ? String(ad.type) : null,
      status: adGroupAd.status ? String(adGroupAd.status) : null,
      headlinesText: textFromAssetList(rsa.headlines),
      descriptionsText: textFromAssetList(rsa.descriptions),
      finalUrl: firstUrl(ad.finalUrls),
    };
    const list = adsByAdGroup.get(adGroupId) ?? [];
    list.push(view);
    adsByAdGroup.set(adGroupId, list);
  }

  for (const row of input.keywordRows) {
    const criterion = asRecord(row.adGroupCriterion);
    const keyword = asRecord(criterion.keyword);
    const adGroupId = lastResourceId(criterion.adGroup);
    const externalId = String(criterion.criterionId ?? lastResourceId(criterion.resourceName));
    if (!adGroupId || !externalId || !keyword.text) continue;
    const view: SyncedKeywordView = {
      externalId,
      resourceName: criterion.resourceName ? String(criterion.resourceName) : null,
      text: String(keyword.text),
      matchType: keyword.matchType ? String(keyword.matchType) : null,
      status: criterion.status ? String(criterion.status) : null,
      isNegative: Boolean(criterion.negative),
    };
    const list = keywordsByAdGroup.get(adGroupId) ?? [];
    list.push(view);
    keywordsByAdGroup.set(adGroupId, list);
  }

  for (const row of input.adGroupRows) {
    const adGroup = asRecord(row.adGroup);
    const campaignId = lastResourceId(adGroup.campaign);
    const externalId = String(adGroup.id ?? lastResourceId(adGroup.resourceName));
    if (!campaignId || !externalId) continue;
    const view: SyncedAdGroupView = {
      externalId,
      resourceName: adGroup.resourceName ? String(adGroup.resourceName) : null,
      name: String(adGroup.name ?? "Untitled ad group"),
      status: adGroup.status ? String(adGroup.status) : null,
      type: adGroup.type ? String(adGroup.type) : null,
      ads: adsByAdGroup.get(externalId) ?? [],
      keywords: keywordsByAdGroup.get(externalId) ?? [],
    };
    const list = adGroupsByCampaign.get(campaignId) ?? [];
    list.push(view);
    adGroupsByCampaign.set(campaignId, list);
  }

  return input.campaignRows
    .map((row) => {
      const campaign = asRecord(row.campaign);
      const externalId = String(campaign.id ?? lastResourceId(campaign.resourceName));
      if (!externalId) return null;
      const view: SyncedCampaignView = {
        externalId,
        resourceName: campaign.resourceName ? String(campaign.resourceName) : null,
        name: String(campaign.name ?? "Untitled campaign"),
        advertisingChannelType: campaign.advertisingChannelType
          ? String(campaign.advertisingChannelType)
          : null,
        status: campaign.status ? String(campaign.status) : null,
        servingStatus: campaign.servingStatus ? String(campaign.servingStatus) : null,
        biddingStrategyType: campaign.biddingStrategyType
          ? String(campaign.biddingStrategyType)
          : null,
        lastSyncedAt: null,
        adGroups: adGroupsByCampaign.get(externalId) ?? [],
      };
      return view;
    })
    .filter((row): row is SyncedCampaignView => Boolean(row));
}
