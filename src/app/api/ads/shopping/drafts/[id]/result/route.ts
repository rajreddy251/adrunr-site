import { getShoppingDraftResult } from "@/lib/shopping-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await getShoppingDraftResult(id);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
