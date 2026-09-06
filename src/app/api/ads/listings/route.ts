import { listCachedListings } from "@/lib/listings-sync";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
    const result = await listCachedListings(customerId);
    return Response.json({
      ok: true,
      ...result,
      safety: {
        readOnly: true,
        enablePath: false,
        note: "Cached listings are a snapshot. Sync never enables or unpauses live Ads.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
