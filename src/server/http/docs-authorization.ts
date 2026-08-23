import "server-only";

import { parseApiKeyAuthorization } from "~/server/api-keys/authorization";
import { resolveApiKeyIdentity } from "~/server/api-keys/service";
import { auth } from "~/server/auth";

export async function canReadMachineDocs(request: Request): Promise<boolean> {
  const session = await auth();
  if (session?.user?.id) return true;

  const candidate = parseApiKeyAuthorization(
    request.headers.get("authorization"),
  );
  if (!candidate) return false;

  try {
    return Boolean(await resolveApiKeyIdentity(candidate));
  } catch {
    return false;
  }
}
