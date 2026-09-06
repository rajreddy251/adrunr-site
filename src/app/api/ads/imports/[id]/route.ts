import { getCampaignImportJob } from "@/lib/campaign-import-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = await getCampaignImportJob(id);
    return Response.json({
      ok: true,
      job,
      safety: {
        enablePath: false,
        neverEnable: true,
        note: "Imported drafts stay on the PAUSED create path. There is no enable / unpause action.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
