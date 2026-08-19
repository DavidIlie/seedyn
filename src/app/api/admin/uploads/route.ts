import {
  decodeAdminUploadCursor,
  loadAdminUploadPage,
  parseAdminUploadKind,
  parseAdminUploadOrigin,
} from "~/server/admin/uploads";
import { authorizeAdminRead } from "~/server/admin/http";

export async function GET(request: Request): Promise<Response> {
  const authorization = await authorizeAdminRead(request);
  if (authorization instanceof Response) return authorization;
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
