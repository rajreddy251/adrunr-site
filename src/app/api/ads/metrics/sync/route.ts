import { syncMetrics } from "@/lib/metrics-sync";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncMetrics(body);
    return Response.json({
      ok: true,
      ...result,
      safety: {
        readOnly: true,
        enablePath: false,
        spendPath: false,
        mutatedAds: false,
        note: result.dryRun
          ? "Dry-run preview — Google Ads was searched (or mocked) only. Neon cache was not written."
          : "Cache updated from a read-only Google Ads search. No campaign was enabled, unpaused, mutated, or spent against.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
