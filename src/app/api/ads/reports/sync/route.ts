import { generateCampaignReport } from "@/lib/reports-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
