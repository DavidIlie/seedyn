import { loader } from "fumadocs-core/source";

import { docs } from "../../.source/server";
import { orderPagesByTree } from "./order";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});

/** Treat malformed, already-decoded percent escapes as a lookup miss. */
export function getDocsPage(slug: string[] | undefined) {
  try {
    return source.getPage(slug);
  } catch (error) {
    // Next has already run decodeURIComponent on route params. Fumadocs runs a
    // decodeURI fallback of its own, which throws for a literal `%` that was
    // validly produced from `%25`. User-controlled paths must resolve to 404.
    if (error instanceof URIError) return undefined;
    throw error;
  }
}

export function getOrderedDocsPages() {
  return orderPagesByTree(source.getPages(), source.getPageTree());
}
