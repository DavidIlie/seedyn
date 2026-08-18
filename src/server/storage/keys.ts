const OWNER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSION = /^[a-z0-9]{1,10}$/;

function ownerId(value: string): string {
  if (!OWNER_ID.test(value)) throw new TypeError("Invalid storage owner id");
  return value;
}

function recordId(value: string): string {
  if (!UUID.test(value)) throw new TypeError("Invalid storage record id");
  return value.toLowerCase();
}

function extension(value: string): string {
  const normalized = value.toLowerCase();
  if (!EXTENSION.test(normalized))
    throw new TypeError("Invalid storage extension");
  return normalized;
}

export function originalObjectKey(input: {
  userId: string;
  uploadId: string;
  extension: string;
}): string {
  return `users/${ownerId(input.userId)}/uploads/${recordId(input.uploadId)}/original.${extension(input.extension)}`;
}

export function gifVariantObjectKey(input: {
  userId: string;
  uploadId: string;
  variantId: string;
}): string {
  return `users/${ownerId(input.userId)}/uploads/${recordId(input.uploadId)}/variants/gif/${recordId(input.variantId)}.gif`;
}

export function managedUserPrefix(userId: string): string {
  return `users/${ownerId(userId)}/`;
}

export function managedUploadPrefix(userId: string, uploadId: string): string {
  return `users/${ownerId(userId)}/uploads/${recordId(uploadId)}/`;
}

export function assertManagedListPrefix(prefix: string): string {
  if (prefix === "users/") return prefix;
  if (/^users\/[A-Za-z0-9_-]{1,128}\/$/.test(prefix)) return prefix;
  if (
    /^users\/[A-Za-z0-9_-]{1,128}\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/$/i.test(
      prefix,
    )
  ) {
    return prefix;
  }
  throw new TypeError("Refusing to list an unmanaged storage prefix");
}

export function isManagedObjectKey(key: string): boolean {
  return (
    /^users\/[A-Za-z0-9_-]{1,128}\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/original\.[a-z0-9]{1,10}$/i.test(
      key,
    ) ||
    /^users\/[A-Za-z0-9_-]{1,128}\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/variants\/gif\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.gif$/i.test(
      key,
    )
  );
}
