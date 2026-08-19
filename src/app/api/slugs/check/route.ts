import { auth } from "~/server/auth";
import { DomainError } from "~/server/uploads/errors";
import { readPublicSlugAvailability } from "~/server/uploads/service";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: { code: "unauthenticated", message: "Sign in first." } },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  const excludeUploadId = params.get("excludeUploadId") ?? undefined;
  if (slug.length > 100 || (excludeUploadId?.length ?? 0) > 128) {
    return Response.json(
      { error: { code: "invalid_input", message: "The request is invalid." } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const availability = await readPublicSlugAvailability({
      userId: session.user.id,
      slug,
      excludeUploadId,
    });
    return Response.json(availability, {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") {
      return Response.json(
        { error: { code: "not_found", message: "Upload not found." } },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json(
      {
        error: {
          code: "internal",
          message: "Availability could not be checked.",
        },
      },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
