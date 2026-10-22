import { getManager } from "@/lib/auth";
import { getDocument } from "@/lib/cases";

// Private evidence images: only the signed-in manager can view them.
export async function GET(_: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const manager = await getManager();
  if (!manager) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const doc = await getDocument(manager.tenantId, id);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": doc.mime_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
