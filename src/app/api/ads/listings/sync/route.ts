import { syncListings } from "@/lib/listings-sync";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncListings(body);
    return Response.json({
      ok: true,
      ...result,
      safety: {
        readOnly: true,
        enablePath: false,
        mutatedAds: false,
        note: result.dryRun
          ? "Dry-run preview — Google Ads was searched (or mocked) only. Neon cache was not written."
          : "Cache updated from a read-only Google Ads search. No campaign was enabled, unpaused, or mutated.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
