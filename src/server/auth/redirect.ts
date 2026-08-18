export function resolveAuthRedirect(
  url: string,
  configuredAppUrl: string,
): string {
  const appUrl = new URL(configuredAppUrl);

  function isSafeDestination(destination: URL): boolean {
    return (
      (destination.protocol === "https:" || destination.protocol === "http:") &&
      destination.origin === appUrl.origin
    );
  }

  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    const destination = new URL(url, appUrl);
    return isSafeDestination(destination)
      ? destination.toString()
      : appUrl.toString();
  }

  try {
    const destination = new URL(url);
    return isSafeDestination(destination)
      ? destination.toString()
      : appUrl.toString();
  } catch {
    return appUrl.toString();
  }
}
