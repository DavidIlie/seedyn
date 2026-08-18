/** Validate the complete server environment before a Node instance is ready. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertAuthConfigured } = await import("~/env");
  assertAuthConfigured();
}
