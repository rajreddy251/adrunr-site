import { createHotelDraft, listHotelDrafts } from "@/lib/hotel-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const drafts = await listHotelDrafts();
    return Response.json({ ok: true, drafts });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const draft = await createHotelDraft(body);
    return Response.json({ ok: true, draft });
  } catch (error) {
    return jsonError(error);
  }
}
