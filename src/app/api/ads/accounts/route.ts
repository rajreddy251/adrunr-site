import { listAccounts } from "@/lib/google-ads";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await listAccounts();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
