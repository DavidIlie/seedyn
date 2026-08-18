import { instant } from "@next/playwright";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import {
  createProductionTestIdentity,
  deleteProductionTestIdentity,
  type ProductionTestIdentity,
} from "./production-auth";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQI12P4z9DwHxkzkC4AAEhPJ+GNvPjFAAAAAElFTkSuQmCC",
  "base64",
);

const DOCS_READING_ORDER = [
  { path: "/docs", title: "Seedyn" },
  { path: "/docs/uploads", title: "Browser uploads" },
  { path: "/docs/http-api", title: "Upload API" },
  { path: "/docs/api-keys", title: "API keys" },
  { path: "/docs/serving", title: "Serving objects" },
  { path: "/docs/gif", title: "Copy as GIF" },
  { path: "/docs/sharex", title: "ShareX setup" },
  { path: "/docs/legacy-api", title: "Compatibility endpoints" },
  { path: "/docs/security", title: "Security model" },
  { path: "/docs/operations", title: "Operations" },
];

async function signIn(page: Page) {
  if (process.env.E2E_PRODUCTION === "true") {
    const prisma = new PrismaClient();
    let identity: ProductionTestIdentity;
    try {
      identity = await createProductionTestIdentity(prisma, "browser");
      productionIdentities.push(identity);
    } finally {
      await prisma.$disconnect();
    }
    await page.context().addCookies([
      {
        name: "authjs.session-token",
        value: identity.sessionToken,
        url: "http://seedyn.localhost:3101",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Library", exact: true }),
    ).toBeVisible();
    return;
  }

  await page.goto("/sign-in");
  if (new URL(page.url()).pathname === "/dashboard") return;

  await page
    .getByRole("button", { name: "Continue with local development sign-in" })
    .click();
  await page.waitForURL((url) => url.pathname === "/dashboard");
  await expect(
    page.getByRole("heading", { name: "Library", exact: true }),
  ).toBeVisible();
}

const productionIdentities: ProductionTestIdentity[] = [];

test.afterEach(async () => {
  if (productionIdentities.length === 0) return;
  const prisma = new PrismaClient();
  try {
    for (const identity of productionIdentities.splice(0)) {
      await deleteProductionTestIdentity(prisma, identity);
    }
  } finally {
    await prisma.$disconnect();
  }
});

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText;

    // A Server Action redirect intentionally aborts its POST navigation. Keep
    // reporting genuine fetch and CORS failures, but ignore that browser-level
    // hand-off signal.
    if (failure === "net::ERR_ABORTED") return;

    errors.push(
      `${request.method()} ${request.url()}: ${failure ?? "request failed"}`,
    );
  });
  return errors;
}

test("the sign-in and authenticated library shells are instant", async ({
  page,
  baseURL,
}) => {
  const errors = collectBrowserErrors(page);

  await instant(
    page,
    async () => {
      await page.goto("/sign-in");
      await expect(
        page.getByRole("heading", { name: "Sign in to Seedyn", level: 1 }),
      ).toBeVisible();
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const heading = document.querySelector("h1");
            if (!heading) return false;
            const rootStyle = getComputedStyle(document.documentElement);
            const bodyStyle = getComputedStyle(document.body);
            const headingStyle = getComputedStyle(heading);
            return (
              [...document.styleSheets].some((sheet) =>
                sheet.href?.includes("/_next/static/"),
              ) &&
              bodyStyle.fontFamily.includes("Onest") &&
              bodyStyle.backgroundColor !== "rgba(0, 0, 0, 0)" &&
              rootStyle.getPropertyValue("--accent").trim().length > 0 &&
              headingStyle.fontSize === "32px" &&
              headingStyle.fontWeight === "600"
            );
          }),
        )
        .toBe(true);
      await expect(
        page.getByRole("button", {
          name: "Continue with local development sign-in",
        }),
      ).toHaveCount(0);
    },
    { baseURL },
  );

  const providerButton = page.getByRole("button", {
    name:
      process.env.E2E_PRODUCTION === "true"
        ? "Continue with DavidApps"
        : "Continue with local development sign-in",
  });
  await expect(providerButton).toBeVisible();

  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/sign-in");
  await expect(providerButton).toBeVisible();
  const providerRect = await providerButton.boundingBox();
  expect(providerRect).not.toBeNull();
  expect(providerRect!.y + providerRect!.height).toBeLessThanOrEqual(640);
  await page.setViewportSize({ width: 1280, height: 800 });

  await signIn(page);

  const uploadTrigger = page.getByRole("button", {
    name: "Upload",
    exact: true,
  });
  await uploadTrigger.click();
  const uploadDialog = page.getByRole("dialog", { name: "Upload" });
  await expect(uploadDialog).toBeVisible();
  const uploadDialogBox = await uploadDialog.boundingBox();
  expect(uploadDialogBox).not.toBeNull();
  expect(uploadDialogBox!.x).toBeGreaterThan(8);
  expect(uploadDialogBox!.y).toBeGreaterThan(8);
  await page.mouse.click(8, 8);
  await expect(uploadDialog).toBeHidden({ timeout: 1_000 });
  await expect(uploadTrigger).toBeFocused();

  await uploadTrigger.click();
  await expect(uploadDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(uploadDialog).toBeHidden({ timeout: 1_000 });
  await expect(uploadTrigger).toBeFocused();

  const accountTrigger = page.locator(
    "summary:visible[aria-label^='Account menu for']",
  );
  await expect(accountTrigger).toBeVisible();
  await accountTrigger.click();

  const accountMenu = page.getByRole("group", { name: "Account" });
  await expect(accountMenu).toBeVisible();
  await expect(accountMenu.getByText("Signed in as")).toBeVisible();
  await expect(
    accountMenu.getByText(
      process.env.E2E_PRODUCTION === "true"
        ? "Seedyn E2E"
        : "Seedyn local developer",
      { exact: true },
    ),
  ).toBeVisible();
  if (process.env.E2E_PRODUCTION !== "true") {
    await expect(
      accountMenu.getByText("david@davidilie.com", { exact: true }),
    ).toBeVisible();
  }
  await expect(
    accountMenu.getByRole("link", { name: "API keys", exact: true }),
  ).toHaveAttribute("href", "/api-keys");
  await expect(
    accountMenu.getByRole("link", { name: "Documentation", exact: true }),
  ).toHaveAttribute("href", "/docs");
  const adminLink = accountMenu.getByRole("link", {
    name: "Admin",
    exact: true,
  });
  await expect(adminLink).toHaveAttribute("href", "/admin");
  await expect(
    accountMenu.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountMenu).toBeHidden();
  await expect(accountTrigger).toBeFocused();

  await accountTrigger.click();
  await adminLink.click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(
    page.getByRole("heading", { name: "Admin", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Seedyn totals" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Users", level: 2 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "7d", exact: true }).click();
  await page.waitForURL(
    (url) => url.pathname === "/admin" && url.search === "?range=7",
  );
  await expect(
    page.getByRole("link", { name: "7d", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  for (const destination of [
    { label: "Images", path: "/images", heading: "Images" },
    { label: "Files", path: "/files", heading: "Files" },
    { label: "Texts", path: "/texts", heading: "Texts" },
    { label: "API keys", path: "/api-keys", heading: "API keys" },
    { label: "Docs", path: "/docs", heading: "Seedyn" },
    { label: "Library", path: "/dashboard", heading: "Library" },
  ]) {
    await instant(page, async () => {
      await page
        .getByRole("link", { name: destination.label, exact: true })
        .click();
      await page.waitForURL((url) => url.pathname === destination.path);
      if (destination.path === "/docs") {
        await expect(
          page.getByRole("status", { name: "Loading documentation" }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", { name: destination.heading, level: 1 }),
        ).toBeVisible();
      }
    });
    await expect(
      page.getByRole("heading", { name: destination.heading, level: 1 }),
    ).toBeVisible();
    if (destination.path === "/images") {
      await expect(
        page.getByRole("searchbox", { name: "Search filenames" }),
      ).toBeVisible();
    }
  }

  // Next retains the previous route tree with `display: none !important`
  // during a client transition. The shared route marker must return the main
  // to product geometry even while that inactive docs tree still exists.
  const appMain = page.locator("main.app-main");
  await expect(appMain).toHaveCSS("padding-left", "16px");
  await expect(appMain).toHaveCSS("padding-right", "16px");
  await expect(appMain).toHaveCSS("max-width", "1152px");

  await page.getByRole("link", { name: "Seedyn library" }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Library", exact: true }),
  ).toBeFocused();

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Library", level: 1 }),
  ).toBeVisible();
  await expect(
    page.locator("summary:visible").filter({ hasText: "Browse" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("summary:visible[aria-label^='Account menu for']"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("an active transfer cannot be dismissed without an explicit choice", async ({
  page,
}) => {
  let releaseRequest: (() => void) | undefined;
  const requestMayFinish = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route("**/api/uploads", async (route) => {
    await requestMayFinish;
    await route.abort("aborted").catch(() => undefined);
  });
  await signIn(page);

  const uploadTrigger = page.getByRole("button", {
    name: "Upload",
    exact: true,
  });
  await uploadTrigger.click();
  const uploadDialog = page.getByRole("dialog", { name: "Upload" });
  await uploadDialog.locator('input[type="file"]').setInputFiles({
    name: "in-flight.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await uploadDialog.getByRole("button", { name: "Upload file" }).click();
  await expect(uploadDialog.getByRole("progressbar")).toBeVisible();

  await page.mouse.click(8, 8);
  await expect(uploadDialog).toBeVisible();
  const closeWarning = uploadDialog.getByRole("alert");
  await expect(closeWarning).toContainText("Cancel this transfer?");
  await expect(
    uploadDialog.getByRole("button", { name: "Keep uploading" }),
  ).toBeFocused();

  await uploadDialog.getByRole("button", { name: "Keep uploading" }).click();
  await expect(closeWarning).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(closeWarning).toContainText("Cancel this transfer?");

  await uploadDialog.getByRole("button", { name: "Cancel and close" }).click();
  releaseRequest?.();
  await expect(uploadDialog).toBeHidden({ timeout: 1_000 });
  await expect(uploadTrigger).toBeFocused();
});

test("pasting a clipboard image immediately creates selectable PNG and GIF URLs", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const filename = `clipboard-${Date.now()}.png`;
  let uploadId: string | undefined;
  let releaseGifRequest: (() => void) | undefined;
  const gifRequestMayFinish = new Promise<void>((resolve) => {
    releaseGifRequest = resolve;
  });
  await page.route("**/api/uploads/*/gif", async (route) => {
    await gifRequestMayFinish;
    await route.continue();
  });
  await signIn(page);

  try {
    await page.evaluate(
      ({ bytes, name }) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], name, { type: "image/png" }),
        );
        document.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
          }),
        );
      },
      { bytes: [...PNG], name: filename },
    );

    const dialog = page.getByRole("dialog", { name: "Upload" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(filename + " is stored and ready to share."),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      dialog.getByRole("button", { name: "Upload file" }),
    ).toHaveCount(0);

    const copyPng = dialog.getByRole("button", {
      name: "Copy the PNG URL",
    });
    await expect(copyPng).toBeVisible();
    await dialog.getByRole("button", { name: "Create GIF URL" }).click();
    await expect(dialog.getByText("Storing the GIF —")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "View upload" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Upload another" }),
    ).toBeDisabled();

    await page.evaluate(
      ({ bytes }) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], "must-not-replace.png", {
            type: "image/png",
          }),
        );
        document.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
          }),
        );
      },
      { bytes: [...PNG] },
    );
    await expect(
      dialog.getByText(filename + " is stored and ready to share."),
    ).toBeVisible();
    await expect(dialog.getByText("must-not-replace.png")).toHaveCount(0);

    releaseGifRequest?.();
    const copyGif = dialog.getByRole("button", {
      name: "Copy the GIF URL",
    });
    await expect(copyGif).toBeVisible({ timeout: 15_000 });

    await copyPng.click();
    await expect(copyPng).toHaveAttribute("data-state", /^(copied|failed)$/u);
    await copyGif.click();
    await expect(copyGif).toHaveAttribute("data-state", /^(copied|failed)$/u);

    const detailHref = await dialog
      .getByRole("link", { name: "View upload" })
      .getAttribute("href");
    expect(detailHref).toMatch(/^\/uploads\//u);
    uploadId = detailHref?.split("/").at(-1);
    await dialog.getByRole("link", { name: "View upload" }).click();
    await page.waitForURL((url) => url.pathname === detailHref);
    await expect(
      page.getByRole("link", { name: "Download GIF" }),
    ).toBeVisible();

    await page.getByText("Delete this upload…").click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await page.waitForURL((url) => url.pathname === "/dashboard");
    uploadId = undefined;
    expect(errors).toEqual([]);
  } finally {
    if (uploadId) {
      await page.request.delete(`/api/uploads/${uploadId}`, {
        headers: {
          Accept: "application/json",
          Origin: new URL(page.url()).origin,
        },
      });
    }
    releaseGifRequest?.();
  }
});

test("signed-out documentation discloses neither prose nor the page tree", async ({
  request,
}) => {
  const protectedTitles = [
    "Browser uploads",
    "Serving objects",
    "Compatibility endpoints",
    "Security model",
  ];

  const requestHeaders: Record<string, string>[] = [{}, { RSC: "1" }];
  for (const headers of requestHeaders) {
    const response = await request.get("/docs", {
      headers,
      maxRedirects: 0,
    });
    const body = await response.text();
    for (const title of protectedTitles) expect(body).not.toContain(title);
  }

  for (const path of ["/docs.md", "/llms.txt", "/llms-full.txt"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(401);
  }
});

test("signed-out visitors cannot read the admin ledger", async ({ page }) => {
  await page.goto("/admin");
  await page.waitForURL((url) => url.pathname === "/sign-in");
  await expect(page.getByRole("heading", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByText("Seedyn totals")).toHaveCount(0);
  await expect(page.getByText("david@davidilie.com")).toHaveCount(0);
});

test("documentation surfaces share the authored reading order", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/docs");
  await expect(
    page.getByRole("heading", { name: "Seedyn", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("#nd-docs-layout")).toBeVisible();
  await expect(page.locator("#nd-page")).toBeVisible();

  const docsLinks = page.locator("#nd-sidebar a[data-active]");
  await expect(docsLinks).toHaveCount(DOCS_READING_ORDER.length);
  expect(await docsLinks.allTextContents()).toEqual(
    DOCS_READING_ORDER.map((entry) => entry.title),
  );
  await expect(docsLinks.first()).toHaveAttribute("data-active", "true");
  await expect(page.locator("#nd-toc")).toContainText("Start here");

  const indexResponse = await page.request.get("/llms.txt");
  expect(indexResponse.status()).toBe(200);
  const indexTitles = [
    ...(await indexResponse.text()).matchAll(/^- \[([^\]]+)]\(/gm),
  ].map((match) => match[1]);
  expect(indexTitles).toEqual(DOCS_READING_ORDER.map((entry) => entry.title));

  const fullResponse = await page.request.get("/llms-full.txt");
  expect(fullResponse.status()).toBe(200);
  const canonicalPaths = [
    ...(await fullResponse.text()).matchAll(/^- Canonical: (\S+)$/gm),
  ].map((match) => new URL(match[1]!).pathname);
  expect(canonicalPaths).toEqual(DOCS_READING_ORDER.map((entry) => entry.path));

  const malformedMarkdown = await page.request.get("/llms.mdx/docs/%25");
  expect(malformedMarkdown.status()).toBe(404);
  const malformedHtml = await page.request.get("/docs/%25");
  expect(malformedHtml.status()).toBe(404);

  // Fumadocs' page, TOC popover, and article must remain direct grid items.
  // A wrapper here silently auto-places the article into an intrinsic outer
  // track and only reveals itself as horizontal clipping on a narrow viewport.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/docs/http-api");
  await expect(
    page.getByRole("heading", { name: "Upload API", level: 1 }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Upload" });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    }),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Proxy-excluded upload methods retain the strict host boundary", async ({
  request,
  baseURL,
}) => {
  const port = new URL(baseURL!).port;
  const paths = [
    "/api/upload",
    "/api/files",
    "/api/images",
    "/api/texts",
    "/api/uploads",
    "/api/uploads/123e4567-e89b-42d3-a456-426614174000/gif",
  ];

  const appOptions = await request.fetch(`${baseURL}/api/upload`, {
    method: "OPTIONS",
  });
  expect(appOptions.status()).toBe(204);
  expect(appOptions.headers().allow).toBe("OPTIONS, POST");

  for (const path of paths) {
    const media = await request.get(`http://i.localhost:${port}${path}`);
    expect(media.status()).toBe(404);

    const unknown = await request.fetch(`http://127.0.0.1:${port}${path}`, {
      method: "OPTIONS",
      headers: { Host: "attacker.test" },
    });
    expect(unknown.status()).toBe(421);
  }
});

test("a browser upload becomes a permanent GIF and can be deleted", async ({
  page,
  request,
}) => {
  const errors = collectBrowserErrors(page);
  const filename = `seedyn-e2e-${Date.now()}.png`;
  const gifFilename = filename.replace(/\.png$/u, ".gif");
  let originalUrl: string | undefined;
  await signIn(page);

  try {
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Upload" });
    const browseFiles = dialog.getByRole("button", { name: "Browse files" });
    await browseFiles.focus();
    await expect
      .poll(() =>
        browseFiles.evaluate((button) => getComputedStyle(button).outlineWidth),
      )
      .not.toBe("0px");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: "image/png",
      buffer: PNG,
    });
    await dialog.getByRole("button", { name: "Upload file" }).click();
    await expect(
      page.getByText(filename + " is stored and ready to share."),
    ).toBeVisible();
    const copyUploadedUrl = dialog.getByRole("button", {
      name: "Copy the uploaded URL",
    });
    await copyUploadedUrl.click();
    await expect(copyUploadedUrl).toHaveAttribute(
      "data-state",
      /^(copied|failed)$/u,
    );
    const visibleCopyState = (await copyUploadedUrl.textContent())?.trim();
    const accessibleCopyState =
      await copyUploadedUrl.getAttribute("aria-label");
    expect(accessibleCopyState).toContain(visibleCopyState);
    await instant(page, async () => {
      await page.getByRole("link", { name: "View upload" }).click();
      await page.waitForURL((url) => url.pathname.startsWith("/uploads/"));
      await expect(
        page.getByRole("heading", { name: "Details", level: 2 }),
      ).toBeVisible();
    });

    const heading = page.getByRole("heading", { level: 1 });
    const mediaPort = new URL(page.url()).port;
    await expect(heading).toContainText(`i.localhost:${mediaPort}/`);
    originalUrl = (await heading.textContent())?.trim();
    expect(originalUrl).toMatch(
      new RegExp(`^http://i\\.localhost:${mediaPort}/[A-Za-z0-9_-]+\\.png$`),
    );

    await page.getByRole("button", { name: "Convert to GIF" }).click();
    const preview = page.getByAltText(
      "Preview of the GIF this browser produced",
    );
    const conversionFailure = page
      .getByRole("region", { name: "GIF" })
      .getByRole("alert");
    await expect
      .poll(
        async () => {
          if (await preview.isVisible()) return "ready";
          if (await conversionFailure.isVisible()) {
            return `${await conversionFailure.textContent()} (${errors.join("; ")})`;
          }
          return "pending";
        },
        { timeout: 15_000 },
      )
      .toBe("ready");
    await page.getByRole("button", { name: "Store this GIF" }).click();
    await expect(
      page.getByRole("link", { name: "Download GIF" }),
    ).toBeVisible();

    const gifUrl = await page
      .getByRole("link", { name: "Download GIF" })
      .getAttribute("href");
    expect(gifUrl).toMatch(
      new RegExp(`^http://i\\.localhost:${mediaPort}/[A-Za-z0-9_-]+\\.gif$`),
    );

    const originalResponse = await request.get(originalUrl!);
    expect(originalResponse.status()).toBe(200);
    expect(originalResponse.headers()["content-type"]).toBe("image/png");
    expect(originalResponse.headers()["content-security-policy"]).toBe(
      "sandbox; default-src 'none'",
    );
    expect(originalResponse.headers()["content-security-policy"]).not.toContain(
      "unsafe-inline",
    );
    await expect(originalResponse.body()).resolves.toEqual(PNG);

    const partialResponse = await request.get(originalUrl!, {
      headers: { Range: "bytes=0-3" },
    });
    expect(partialResponse.status()).toBe(206);
    expect(partialResponse.headers()["cache-control"]).toBe(
      "private, max-age=3600, no-transform",
    );
    expect(partialResponse.headers().vary?.toLowerCase()).toContain("range");
    expect(partialResponse.headers()["content-range"]).toBe(
      `bytes 0-3/${PNG.byteLength}`,
    );
    await expect(partialResponse.body()).resolves.toEqual(PNG.subarray(0, 4));

    const ignoredRangeResponse = await request.get(originalUrl!, {
      headers: { Range: "items=0-1" },
    });
    expect(ignoredRangeResponse.status()).toBe(200);
    await expect(ignoredRangeResponse.body()).resolves.toEqual(PNG);

    const headResponse = await request.head(originalUrl!);
    expect(headResponse.status()).toBe(200);
    expect(headResponse.headers()["content-length"]).toBe(
      String(PNG.byteLength),
    );
    await expect(headResponse.body()).resolves.toHaveLength(0);

    const gifResponse = await request.get(gifUrl!);
    expect(gifResponse.status()).toBe(200);
    expect(gifResponse.headers()["content-type"]).toBe("image/gif");
    expect(gifResponse.headers()["content-disposition"]).toContain(
      `filename="${gifFilename}"`,
    );
    expect((await gifResponse.body()).subarray(0, 6).toString("ascii")).toMatch(
      /^GIF8[79]a$/,
    );

    const detailUrl = page.url();
    await page.goto("/admin");
    const totals = page.getByRole("region", { name: "Seedyn totals" });
    await expect(
      totals.locator("dt", { hasText: "Uploads" }).locator(".."),
    ).toContainText("1");
    await expect(
      totals.locator("dt", { hasText: "GIF variants" }).locator(".."),
    ).toContainText("1");
    await expect(page.locator(".recharts-wrapper")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Users", level: 2 }),
    ).toBeVisible();
    await page.goto(detailUrl);

    await page.getByText("Delete this upload…").click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await page.waitForURL((url) => url.pathname === "/dashboard");
    await expect(
      page
        .locator('section[aria-labelledby="latest-heading"]')
        .getByText(filename, { exact: true }),
    ).toHaveCount(0);

    expect((await request.get(originalUrl!)).status()).toBe(404);
    expect((await request.get(gifUrl!)).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    if (new URL(page.url()).pathname.startsWith("/uploads/")) {
      await page.getByText("Delete this upload…").click();
      await page.getByRole("button", { name: "Delete permanently" }).click();
      await page.waitForURL((url) => url.pathname === "/dashboard");
    }
  }
});

test("an upload larger than Next's default Proxy clone limit remains intact", async ({
  page,
}) => {
  await signIn(page);
  const origin = new URL(page.url()).origin;
  const body = Buffer.alloc(10 * 1024 * 1024 + 1024, 0xff);
  let uploadId: string | undefined;

  try {
    const response = await page.request.post("/api/uploads", {
      headers: { Accept: "application/json", Origin: origin },
      multipart: {
        file: {
          name: "over-proxy-clone-limit.bin",
          mimeType: "application/octet-stream",
          buffer: body,
        },
      },
    });
    expect(response.status()).toBe(201);
    const result = (await response.json()) as { id?: string; url?: string };
    expect(result.url).toMatch(
      /^http:\/\/i\.localhost:\d+\/[A-Za-z0-9_-]+\.bin$/,
    );
    uploadId = result.id;
    expect(uploadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  } finally {
    if (uploadId) {
      const deleted = await page.request.delete(`/api/uploads/${uploadId}`, {
        headers: { Accept: "application/json", Origin: origin },
      });
      expect(deleted.status()).toBe(204);
    }
  }
});

test("an API key is revealed once, exported to ShareX, and revoked", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const keyName = `Seedyn E2E ${Date.now()}`;
  const prisma = new PrismaClient();

  try {
    await signIn(page);
    await page.getByRole("link", { name: "API keys" }).click();
    await page.getByLabel("Name").fill(keyName);
    await page.getByRole("button", { name: "Create key" }).click();

    const reveal = page.getByRole("region", { name: "Save this key now" });
    const rawKey = (await reveal.locator("code").textContent())?.trim();
    expect(rawKey).toMatch(/^sdn_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Seedyn.sxcu" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Seedyn.sxcu");
    const config = JSON.parse(
      await download.createReadStream().then(async (stream) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks).toString("utf8");
      }),
    ) as { Headers?: { Authorization?: string }; RequestURL?: string };
    expect(config.Headers?.Authorization).toBe(`Bearer ${rawKey}`);
    expect(config.RequestURL).toBe(`${new URL(page.url()).origin}/api/upload`);

    await page.getByRole("button", { name: "I saved it" }).click();
    await expect(reveal).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(rawKey!);
    await expect(page.getByText(`${keyName} is active`)).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: keyName });
    await expect(row).toContainText("Never expires");
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(row).toContainText("Inactive");
    expect(errors).toEqual([]);
  } finally {
    await prisma.apiKey.deleteMany({ where: { name: keyName } });
    await prisma.$disconnect();
  }
});
