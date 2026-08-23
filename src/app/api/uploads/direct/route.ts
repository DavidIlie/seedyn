import { z } from "zod";

import { db } from "~/server/db";
import { authorizeBrowserMutation } from "~/server/http/browser-mutation";
import { domainErrorResponse } from "~/server/http/errors";
import { readBoundedJson } from "~/server/http/json-body";
import {
  resolveMediaDomainPreference,
  validMediaDomainId,
} from "~/server/media/origin-preferences";
import { createDirectUploadSession } from "~/server/uploads/direct/session";
import { DomainError } from "~/server/uploads/errors";

export const maxDuration = 120;

const bodySchema = z.object({
  originalName: z.string().max(1_024),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  prefix: z.string().min(1).max(16_384),
  slug: z.string().max(64).optional(),
  mediaDomain: z.string().max(64).optional(),
});

function decodePrefix(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+={0,2}$/u.test(value)) {
    throw new DomainError("invalid_input", {
      message: "The upload prefix is invalid.",
    });
  }
  const prefix = Buffer.from(value, "base64url");
  if (prefix.byteLength < 1 || prefix.byteLength > 8 * 1024) {
    throw new DomainError("invalid_input", {
      message: "The upload prefix is invalid.",
    });
  }
  return new Uint8Array(prefix);
}

export async function POST(request: Request): Promise<Response> {
  const authorization = await authorizeBrowserMutation(request);
  if (authorization instanceof Response) return authorization;
  try {
    const parsed = bodySchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new DomainError("invalid_input");
    const requestedMediaDomain = parsed.data.mediaDomain?.trim() || null;
    if (requestedMediaDomain && !validMediaDomainId(requestedMediaDomain)) {
      throw new DomainError("invalid_input", {
        message: "Choose a configured media domain.",
      });
    }
    const account = await db.user.findUnique({
      where: { id: authorization.userId },
      select: { defaultMediaDomain: true },
    });
    if (!account) throw new DomainError("not_found");
    const result = await createDirectUploadSession({
      userId: authorization.userId,
      originalName: parsed.data.originalName,
      byteSize: parsed.data.byteSize,
      sha256Hex: parsed.data.sha256,
      sniffPrefix: decodePrefix(parsed.data.prefix),
      publicSlug: parsed.data.slug,
      mediaOrigin: resolveMediaDomainPreference(
        requestedMediaDomain,
        account.defaultMediaDomain,
      ).origin,
    });
    authorization.rateHeaders.set("Cache-Control", "no-store");
    return Response.json(result, {
      status: 201,
      headers: authorization.rateHeaders,
    });
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  }
}
