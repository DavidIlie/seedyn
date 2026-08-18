import { requireSessionUser } from "~/components/data/session";

/**
 * Sends signed-out visitors to `/sign-in`, and renders nothing.
 *
 * It is mounted inside a `<Suspense fallback={null}>` in the app layout so that
 * reading the session cookie does not hold back the header, the page heading,
 * or the row frames. That is safe because this is not the authorization
 * boundary: every page reads its data through a service call scoped to a user
 * id, so the shell that renders in the moment before the redirect commits
 * contains no protected content to leak.
 */
export async function SessionGate() {
  await requireSessionUser();
  return null;
}
