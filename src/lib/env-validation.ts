const trueEnvironmentValues = new Set([
  "1",
  "true",
  "yes",
  "on",
  "y",
  "enabled",
]);

export function shouldSkipEnvironmentValidation(
  value: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  return (
    nodeEnv !== "production" &&
    trueEnvironmentValues.has((value ?? "").trim().toLowerCase())
  );
}
