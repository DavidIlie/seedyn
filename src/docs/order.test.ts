import type { Root } from "fumadocs-core/page-tree";
import { describe, expect, it } from "vitest";

import { orderPagesByTree } from "./order";

const authoredUrls = [
  "/docs",
  "/docs/sharex",
  "/docs/uploads",
  "/docs/api-keys",
  "/docs/gif",
  "/docs/http-api",
  "/docs/legacy-api",
  "/docs/security",
  "/docs/operations",
];

describe("documentation order", () => {
  it("uses the authored page-tree order instead of generated filename order", () => {
    const filenameOrder = [...authoredUrls]
      .sort()
      .map((url) => ({ url, title: url }));
    const tree: Root = {
      name: "Seedyn",
      children: authoredUrls.map((url) => ({
        type: "page",
        name: url,
        url,
      })),
    };

    expect(
      orderPagesByTree(filenameOrder, tree).map((page) => page.url),
    ).toEqual(authoredUrls);
  });

  it("places a nested folder index before its children and retains unlisted pages", () => {
    const pages = [
      { url: "/docs/reference" },
      { url: "/docs/guides/advanced" },
      { url: "/docs/guides" },
      { url: "/docs" },
      { url: "/docs/unlisted" },
    ];
    const tree: Root = {
      name: "Seedyn",
      children: [
        { type: "page", name: "Overview", url: "/docs" },
        {
          type: "folder",
          name: "Guides",
          index: { type: "page", name: "Guides", url: "/docs/guides" },
          children: [
            { type: "separator", name: "Learn" },
            {
              type: "page",
              name: "Advanced",
              url: "/docs/guides/advanced",
            },
          ],
        },
        { type: "page", name: "Reference", url: "/docs/reference" },
      ],
    };

    expect(orderPagesByTree(pages, tree).map((page) => page.url)).toEqual([
      "/docs",
      "/docs/guides",
      "/docs/guides/advanced",
      "/docs/reference",
      "/docs/unlisted",
    ]);
  });
});
