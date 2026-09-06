import { getCampaignReport } from "@/lib/reports-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const report = await getCampaignReport(id);
    return Response.json({
      ok: true,
      report,
      safety: {
        readOnly: true,
        enablePath: false,
        neverEnable: true,
        spendPath: false,
        note: "Persisted performance report. ENABLED campaign status is a snapshot only.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
