import { generateCampaignReport, listCampaignReports } from "@/lib/reports-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
    const reports = await listCampaignReports(customerId);
    return Response.json({
      ok: true,
      reports,
      safety: {
        readOnly: true,
        enablePath: false,
        neverEnable: true,
        spendPath: false,
        note: "Cached performance reports. Generate never enables, unpauses, or spends.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await generateCampaignReport(body);
    return Response.json({
      ok: true,
      ...result,
      safety: {
        readOnly: true,
        enablePath: false,
        neverEnable: true,
        spendPath: false,
        mutatedAds: false,
        note: result.dryRun
          ? "Dry-run preview — report was built from metrics cache or googleAds:search. Neon was not written."
          : "Report persisted from a read-only metrics cache or googleAds:search. No campaign was enabled, unpaused, mutated, or spent against.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
