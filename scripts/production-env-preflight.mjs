import { isIP } from "node:net";

const required = [
  "APP_URL",
  "CDN_URL",
  "APP_HOSTS",
  "MEDIA_HOSTS",
  "DATABASE_URL",
  "REDIS_URL",
  "MINIO_URL",
  "MINIO_PORT",
  "MINIO_SECURE",
  "MINIO_KEY_ID",
  "MINIO_PASSWORD",
  "MINIO_BUCKET",
  "TRUSTED_PROXY_HOPS",
];
const buildOnlyValues = new Set([
  "seedyn-build-only-auth-secret-never-used-at-runtime",
  "seedyn-build-only-client",
  "seedyn-build-only-client-secret",
]);
const trueValues = new Set(["1", "true", "yes", "on", "y", "enabled"]);
const falseValues = new Set(["0", "false", "no", "off", "n", "disabled"]);

function validOrigin(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function validUrl(value) {
  try {
    return new URL(value).href.length > 0;
  } catch {
    return false;
  }
}

export function assertProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("The production entrypoint requires NODE_ENV=production");
  }

  if (trueValues.has((process.env.SEEDYN_DEV_AUTH ?? "").toLowerCase())) {
    throw new Error("SEEDYN_DEV_AUTH must never be enabled in production");
  }

  for (const name of [
    "AUTH_SECRET",
    "AUTH_DAVIDAPPS_ID",
    "AUTH_DAVIDAPPS_SECRET",
  ]) {
    const value = process.env[name]?.trim();
    if (!value || buildOnlyValues.has(value)) {
      throw new Error("DavidApps authentication is not configured");
    }
  }

  for (const name of required) {
    if (!process.env[name]?.trim()) {
      throw new Error("The production environment is not configured");
    }
  }

  const port = process.env.MINIO_PORT ?? "";
  const proxyHops = process.env.TRUSTED_PROXY_HOPS ?? "";
  const secure = (process.env.MINIO_SECURE ?? "").toLowerCase();
  if (
    !validOrigin(process.env.APP_URL) ||
    !validOrigin(process.env.CDN_URL) ||
    !validUrl(process.env.DATABASE_URL) ||
    !validUrl(process.env.REDIS_URL) ||
    !/^\d{1,5}$/u.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65_535 ||
    (!trueValues.has(secure) && !falseValues.has(secure)) ||
    (process.env.MINIO_BUCKET?.length ?? 0) < 3 ||
    !/^[0-4]$/u.test(proxyHops) ||
    (process.env.POD_IP !== undefined && isIP(process.env.POD_IP) === 0)
  ) {
    throw new Error("The production environment is invalid");
  }
}
