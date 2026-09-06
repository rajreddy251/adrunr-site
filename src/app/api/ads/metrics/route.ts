import { listCachedMetrics } from "@/lib/metrics-sync";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
    const result = await listCachedMetrics(customerId);
    return Response.json({
      ok: true,
      ...result,
      safety: {
        readOnly: true,
        enablePath: false,
        spendPath: false,
        note: "Cached campaign metric snapshots. Sync never enables, unpauses, or spends.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
