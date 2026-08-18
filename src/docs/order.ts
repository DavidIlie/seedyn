import { flattenTree, type Root } from "fumadocs-core/page-tree";

export function orderPagesByTree<T extends { url: string }>(
  pages: readonly T[],
  tree: Root,
): T[] {
  const pagesByUrl = new Map(pages.map((page) => [page.url, page]));
  const seen = new Set<string>();
  const ordered: T[] = [];

  for (const node of flattenTree(tree.children)) {
    const page = pagesByUrl.get(node.url);
    if (!page || seen.has(node.url)) continue;
    seen.add(node.url);
    ordered.push(page);
  }

  for (const page of pages) {
    if (!seen.has(page.url)) ordered.push(page);
  }

  return ordered;
}
