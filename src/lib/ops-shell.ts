import { SHELL_SAFETY_STRIP } from "@/lib/safety";

export { SHELL_SAFETY_STRIP };

export const OPS_CUSTOMER_STORAGE_KEY = "adrunr.ops.customerId";
export const OPS_GA4_PROPERTY_STORAGE_KEY = "adrunr.ops.ga4PropertyId";

export const OPS_NAV = [
  { href: "/ops/campaigns", label: "Campaigns" },
  { href: "/ops/listings", label: "Listings" },
  { href: "/ops/metrics", label: "Metrics" },
  { href: "/ops/import", label: "Import" },
  { href: "/ops/reports", label: "Reports" },
  { href: "/ops/analytics", label: "Analytics" },
  { href: "/ops/connect", label: "Connect" },
] as const;

export const OPS_HUB_SHORTCUTS = [
  {
    href: "/ops/campaigns",
    label: "Campaigns",
    detail: "Cached list plus Overview, Safe edit, and Pause/Delete confirms on /ops/campaigns/:id.",
  },
  {
    href: "/ops/campaigns/new/search",
    label: "Create Search",
    detail: "S0–S8 Search create wizard. Dry-run first. Creates stay PAUSED.",
  },
  {
    href: "/ops/listings",
    label: "Listings",
    detail: "Read-only synced campaigns, ad groups, ads, and keywords.",
  },
  {
    href: "/ops/metrics",
    label: "Metrics",
    detail: "Read-only budget and spend snapshots.",
  },
  {
    href: "/ops/import",
    label: "Import",
    detail: "Map a cached campaign into a PAUSED create-type draft.",
  },
  {
    href: "/ops/reports",
    label: "Reports",
    detail: "Read-only performance rollups. Preview first.",
  },
  {
    href: "/ops/analytics",
    label: "Analytics",
    detail: "Connect GA4, pick a property, and read sessions for the last 7 days.",
  },
  {
    href: "/ops/connect",
    label: "Connect",
    detail: "Google Ads + GA4 OAuth, property bind, and the seeded provider registry.",
  },
] as const;

export const CAMPAIGN_TYPE_FILTERS = [
  { value: "", label: "All types" },
  { value: "SEARCH", label: "Search" },
  { value: "DISPLAY", label: "Display" },
  { value: "PERFORMANCE_MAX", label: "Performance Max" },
  { value: "DEMAND_GEN", label: "Demand Gen" },
  { value: "VIDEO", label: "Video" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "MULTI_CHANNEL", label: "App" },
  { value: "HOTEL", label: "Hotel" },
  { value: "LOCAL", label: "Local" },
  { value: "LOCAL_SERVICES", label: "Local Services" },
] as const;

export function isOpsNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
