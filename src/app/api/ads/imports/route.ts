import { importCachedCampaign, listCampaignImportJobs } from "@/lib/campaign-import-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
    const jobs = await listCampaignImportJobs(customerId);
    return Response.json({
      ok: true,
      jobs,
      safety: {
        enablePath: false,
        neverEnable: true,
        note: "Import writes create-type drafts only. Cached ENABLED is a snapshot. Apply stays PAUSED.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await importCachedCampaign(body);
    return Response.json({
      ok: true,
      ...result,
      safety: {
        enablePath: false,
        neverEnable: true,
        mutatedAds: false,
        applyPath: "PAUSED",
        note: result.dryRun
          ? "Dry-run preview — no create-type draft was written. Import never enables spend."
          : "Create-type draft stored from the listings cache. Validate / CREATE PAUSED next. Import did not enable or unpause live Ads.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
