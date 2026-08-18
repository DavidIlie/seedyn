import { compileDeclarativeMatchers, type DeepsecPlugin } from "deepsec/config";

const specs = [
  {
    version: 1,
    slug: "browser-mutation-authorization",
    description:
      "The cookie-session browser mutation guard: authorizeBrowserMutation and the exact-Origin, app-host, session, and rate-limit primitives it composes, plus the route call sites that must short-circuit on its Response result.",
    noiseTier: "precise",
    filePatterns: [
      "src/server/http/*.ts",
      "src/server/http/**/*.ts",
      "src/app/api/uploads/**/route.ts",
    ],
    requires: {
      tech: ["next"],
      sentinelFiles: ["src/server/http/browser-mutation.ts"],
    },
    patterns: [
      {
        source:
          "export\\s+async\\s+function\\s+authorizeBrowserMutation\\s*\\(",
        label: "browser-mutation-guard-definition",
      },
      {
        source: "await\\s+authorizeBrowserMutation\\s*\\(",
        label: "browser-mutation-guard-call",
      },
      {
        source: "hasExactAppOrigin\\s*\\(\\s*request\\s*\\)",
        label: "exact-origin-csrf-check",
      },
      {
        source: "await\\s+checkBrowserMutationRateLimit\\s*\\(",
        label: "browser-mutation-rate-limit",
      },
      {
        source: "authorization\\s+instanceof\\s+Response",
        label: "guard-response-short-circuit",
      },
    ],
    excludeFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    examples: [
      "export async function authorizeBrowserMutation(",
      "const authorization = await authorizeBrowserMutation(request);",
      "if (!hasExactAppOrigin(request)) {",
      "const rateLimit = await checkBrowserMutationRateLimit({",
      "if (authorization instanceof Response) return authorization;",
    ],
    closesSurfaceIds: ["browser-mutation-api"],
  },
  {
    version: 1,
    slug: "upload-domain-error-envelope",
    description:
      "The upload pipeline's DomainError taxonomy and its HTTP envelope mapper: the error class and status/message table, raise sites, asDomainError normalization of unknown throwables, and safeErrorCategory redaction before logging.",
    noiseTier: "precise",
    filePatterns: [
      "src/server/uploads/*.ts",
      "src/server/uploads/**/*.ts",
      "src/server/http/*.ts",
      "src/server/http/**/*.ts",
      "src/app/api/**/route.ts",
    ],
    requires: {
      sentinelFiles: ["src/server/uploads/errors.ts"],
    },
    patterns: [
      {
        source: "class\\s+DomainError\\s+extends\\s+Error",
        label: "domain-error-class",
      },
      {
        source: 'new\\s+DomainError\\s*\\(\\s*"[a-z_]+"',
        label: "domain-error-raise",
      },
      {
        source: "export\\s+function\\s+domainErrorResponse\\s*\\(",
        label: "domain-error-response-mapper",
      },
      {
        source: "asDomainError\\s*\\(\\s*error\\s*\\)",
        label: "unknown-error-normalization",
      },
      {
        source: "safeErrorCategory\\s*\\(",
        label: "error-category-redaction",
      },
    ],
    excludeFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    examples: [
      "export class DomainError extends Error {",
      'throw new DomainError("unsupported_media");',
      "export function domainErrorResponse(",
      "const safe = asDomainError(error);",
      "errorCategory: safeErrorCategory(error),",
    ],
    closesSurfaceIds: ["upload-ingestion-pipeline"],
  },
  {
    version: 1,
    slug: "upload-magic-byte-classification",
    description:
      "Magic-byte upload classification and disposition decisions: classifyUpload, file-type sniffing, active-content text detection, forced-kind and size assertions, GIF variant validation, and original-name sanitization.",
    noiseTier: "precise",
    filePatterns: [
      "src/server/uploads/*.ts",
      "src/server/uploads/**/*.ts",
      "src/server/http/upload-route.ts",
    ],
    requires: {
      tech: ["file-type", "sharp"],
      sentinelFiles: ["src/server/uploads/classification.ts"],
    },
    patterns: [
      {
        source: "export\\s+async\\s+function\\s+classifyUpload\\s*\\(",
        label: "classifier-definition",
      },
      {
        source: "await\\s+fileTypeFromBuffer\\s*\\(",
        label: "magic-byte-sniff",
      },
      {
        source: "unsafeTextFormat\\s*\\(",
        label: "active-content-text-check",
      },
      {
        source: "assertForcedUploadKind\\s*\\(",
        label: "forced-kind-assertion",
      },
      {
        source: "await\\s+validateGifVariant\\s*\\(",
        label: "gif-variant-validation",
      },
      {
        source: 'disposition:\\s*"(?:INLINE|ATTACHMENT)"',
        label: "inline-disposition-decision",
      },
      {
        source: "sanitizeOriginalName\\s*\\(",
        label: "original-name-sanitization",
      },
    ],
    excludeFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    examples: [
      "export async function classifyUpload(",
      "detected = await fileTypeFromBuffer(file.sniffPrefix);",
      "const unsafe = unsafeTextFormat(file.sniffPrefix);",
      "assertForcedUploadKind(classification, forcedKind);",
      "const classification = await validateGifVariant(input.file);",
      'disposition: "ATTACHMENT",',
      "originalName: sanitizeOriginalName(",
    ],
    closesSurfaceIds: ["upload-ingestion-pipeline"],
  },
  {
    version: 1,
    slug: "upload-dto-serialization",
    description:
      "The upload DTO projection boundary that decides which persisted upload and variant columns leave the server: serializeUpload, serializeVariant, their collection projections, and bigint byteSize stringification.",
    noiseTier: "normal",
    filePatterns: [
      "src/server/uploads/serialization.ts",
      "src/server/uploads/service.ts",
      "src/components/data/*.ts",
      "src/components/data/**/*.ts",
    ],
    requires: {
      sentinelFiles: ["src/server/uploads/serialization.ts"],
    },
    patterns: [
      {
        source: "export\\s+function\\s+serializeUpload\\s*\\(",
        label: "upload-dto-definition",
      },
      {
        source: "export\\s+function\\s+serializeVariant\\s*\\(",
        label: "variant-dto-definition",
      },
      {
        source: "\\.map\\(\\s*serializeUpload\\s*\\)",
        label: "collection-dto-projection",
      },
      {
        source: "byteSize:\\s*value\\.byteSize\\.toString\\(",
        label: "bigint-field-projection",
      },
      {
        source: "serializeVariant\\s*\\(\\s*\\w+\\s*\\)",
        label: "variant-dto-projection",
      },
    ],
    excludeFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    examples: [
      "export function serializeUpload(value: UploadLike): SerializedUpload {",
      "export function serializeVariant(value: VariantLike): SerializedVariant {",
      "items: page.map(serializeUpload),",
      "byteSize: value.byteSize.toString(10),",
      "variant: serializeVariant(winner),",
    ],
    closesSurfaceIds: ["upload-ingestion-pipeline"],
  },
  {
    version: 1,
    slug: "authjs-handler-mount",
    description:
      "Auth.js v5 registration primitives: the catch-all route that mounts GET/POST from NextAuth handlers, the NextAuth(authConfig) initialization, AUTH_URL pinning that stops forwarded Host headers deciding callback origins, and the re-exported auth/signIn/signOut primitives.",
    noiseTier: "precise",
    filePatterns: [
      "src/app/api/auth/**/route.ts",
      "src/server/auth/*.ts",
      "src/server/auth/**/*.ts",
    ],
    requires: {
      tech: ["next-auth"],
      sentinelFiles: ["src/server/auth/config.ts"],
    },
    patterns: [
      {
        source:
          "export\\s+const\\s*\\{[^}]*\\b(?:GET|POST)\\b[^}]*\\}\\s*=\\s*handlers",
        label: "authjs-route-handler-mount",
      },
      {
        source: "NextAuth\\s*\\(\\s*authConfig\\s*\\)",
        label: "nextauth-initialization",
      },
      {
        source: "process\\.env\\.AUTH_URL\\s*=",
        label: "auth-url-pinning",
      },
      {
        source: "export\\s*\\{[^}]*\\bhandlers\\b[^}]*\\}",
        label: "auth-primitive-reexport",
      },
      {
        source: "cache\\s*\\(\\s*uncachedAuth\\s*\\)",
        label: "request-cached-session",
      },
    ],
    excludeFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    examples: [
      "export const { GET, POST } = handlers;",
      "const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);",
      "process.env.AUTH_URL = env.APP_URL;",
      "export { auth, handlers, signIn, signOut };",
      "const auth = cache(uncachedAuth);",
    ],
    closesSurfaceIds: ["oidc-auth-endpoints"],
  },
  {
    version: 1,
    slug: "oidc-provider-selection",
    description:
      "Which Auth.js provider is registered and offered: the DavidApps and local-development provider ids, the developmentAuthEnabled gate and its production guard, the providers list selection, and the sign-in invocation that names the active provider.",
    noiseTier: "precise",
    filePatterns: [
      "src/server/auth/*.ts",
      "src/server/auth/**/*.ts",
      "src/components/auth/*.ts",
      "src/components/auth/**/*.ts",
      "src/app/sign-in/**/*.ts",
    ],
    requires: {
      tech: ["next-auth"],
      sentinelFiles: ["src/server/auth/config.ts"],
    },
    patterns: [
      {
        source: "\\b(?:DAVIDAPPS|DEVELOPMENT)_PROVIDER_ID\\b",
        label: "registered-provider-id",
      },
      {
        source: "const\\s+developmentAuthEnabled\\s*=",
        label: "development-provider-gate",
      },
      {
        source:
          'env\\.SEEDYN_DEV_AUTH\\s*&&\\s*env\\.NODE_ENV\\s*!==\\s*"production"',
        label: "dev-auth-production-guard",
      },
      {
        source: "providers:\\s*developmentAuthEnabled",
        label: "provider-list-selection",
      },
      {
        source: "signIn\\s*\\(\\s*activeProviderId",
        label: "provider-signin-invocation",
      },
    ],
    excludeFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    examples: [
      'export const DEVELOPMENT_PROVIDER_ID = "seedyn-development";',
      "export const developmentAuthEnabled =",
      '  env.SEEDYN_DEV_AUTH && env.NODE_ENV !== "production";',
      "  providers: developmentAuthEnabled",
      'await signIn(activeProviderId, { redirectTo: "/dashboard" });',
    ],
    closesSurfaceIds: ["oidc-auth-endpoints"],
  },
  {
    version: 1,
    slug: "managed-storage-reconciliation",
    description:
      "The operator storage/database reconciliation primitive and the managed-prefix guards it depends on: inspectStorageConsistency, its script invocation, assertManagedListPrefix, isManagedObjectKey, and managed object enumeration.",
    noiseTier: "precise",
    filePatterns: [
      "src/server/storage/*.ts",
      "src/server/storage/**/*.ts",
      "scripts/*.ts",
      "scripts/**/*.ts",
    ],
    requires: {
      sentinelFiles: ["src/server/storage/reconcile.ts"],
    },
    patterns: [
      {
        source:
          "export\\s+async\\s+function\\s+inspectStorageConsistency\\s*\\(",
        label: "reconcile-primitive-definition",
      },
      {
        source: "await\\s+inspectStorageConsistency\\s*\\(",
        label: "reconcile-invocation",
      },
      {
        source: "assertManagedListPrefix\\s*\\(",
        label: "managed-prefix-assertion",
      },
      {
        source: "isManagedObjectKey\\s*\\(",
        label: "managed-key-assertion",
      },
      {
        source: "\\.listManaged\\s*\\(",
        label: "managed-object-enumeration",
      },
    ],
    excludeFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    examples: [
      "export async function inspectStorageConsistency(input: {",
      "const report = await inspectStorageConsistency({",
      "const prefix = assertManagedListPrefix(input.prefix);",
      "if (!key.startsWith(prefix) || !isManagedObjectKey(key)) {",
      "for await (const object of input.store.listManaged(prefix)) {",
    ],
    closesSurfaceIds: ["operations-cli"],
  },
  {
    version: 1,
    slug: "next-env-ops-script-entry",
    description:
      "Operator and build script entry points run outside the request path: Next env bootstrapping, the dynamic import of the target script, top-level main() entry and exit status, import.meta.url root resolution, build-time asset copying into public/, and the local identity seed write.",
    noiseTier: "normal",
    filePatterns: [
      "scripts/*.ts",
      "scripts/**/*.ts",
      "scripts/*.mjs",
      "scripts/**/*.mjs",
      "scripts/*.js",
      "scripts/**/*.js",
      "prisma/seed.ts",
    ],
    requires: {
      sentinelFiles: ["scripts/run-with-next-env.ts"],
    },
    patterns: [
      {
        source: "loadEnvConfig\\s*\\(\\s*process\\.cwd\\(\\)",
        label: "next-env-bootstrap",
      },
      {
        source: "await\\s+import\\s*\\(\\s*pathToFileURL\\s*\\(",
        label: "dynamic-script-entry-import",
      },
      {
        source: "await\\s+main\\(\\)\\.finally\\(",
        label: "top-level-script-main",
      },
      {
        source: "process\\.exitCode\\s*=",
        label: "script-exit-status",
      },
      {
        source: "fileURLToPath\\s*\\(\\s*import\\.meta\\.url\\s*\\)",
        label: "script-root-resolution",
      },
      {
        source: "copyFile\\s*\\(\\s*resolve\\s*\\(",
        label: "build-asset-copy",
      },
      {
        source: "db\\.user\\.upsert\\s*\\(",
        label: "seed-identity-upsert",
      },
    ],
    excludeFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
    examples: [
      'nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");',
      "await import(pathToFileURL(resolve(process.cwd(), target)).href);",
      "await main().finally(async () => db.$disconnect());",
      "    process.exitCode = 2;",
      'const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
      "    copyFile(resolve(source, filename), resolve(destination, filename)),",
      "  await db.user.upsert({",
    ],
    closesSurfaceIds: ["operations-cli"],
  },
];

export const generatedMatchersPlugin: DeepsecPlugin = {
  name: "deepsec-generated-matchers",
  matchers: compileDeclarativeMatchers(specs),
};
