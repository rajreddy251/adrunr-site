import { deleteShoppingDraft, getShoppingDraft, updateShoppingDraft } from "@/lib/shopping-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const draft = await getShoppingDraft(id);
    return Response.json({ ok: true, draft });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const draft = await updateShoppingDraft(id, body);
    return Response.json({ ok: true, draft });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  return PATCH(request, context);
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await deleteShoppingDraft(id);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
