import {
  decodeAdminUploadCursor,
  loadAdminUploadPage,
  parseAdminUploadKind,
  parseAdminUploadOrigin,
} from "~/server/admin/uploads";
import { auth } from "~/server/auth";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id || session.user.appRole !== "ADMIN") {
    return Response.json(
      { error: { code: "not_found", message: "Not found." } },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").normalize("NFC").trim().slice(0, 100);
  const page = await loadAdminUploadPage({
    filters: {
      query,
      kind: parseAdminUploadKind(params.get("kind")),
      origin: parseAdminUploadOrigin(params.get("origin")),
    },
    cursor: decodeAdminUploadCursor(params.get("cursor")),
  });
  return Response.json(page, {
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
