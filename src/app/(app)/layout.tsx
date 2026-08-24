import { Suspense } from "react";

import { QueryProvider } from "~/components/data/query-provider";
import { RefreshOnFocus } from "~/components/data/refresh";
import { NavigationBlockerProvider } from "~/components/navigation/navigation-blocker";
import { AppHeader } from "~/components/shell/app-header";
import { RouteLayoutMarker } from "~/components/shell/route-layout-marker";
import { SessionGate } from "~/components/shell/session-gate";
import { UploadProvider } from "~/components/upload/upload-context";
import { env } from "~/env";
import { listMediaDomainChoices } from "~/server/media/origin-preferences";

/**
 * The authenticated shell: skip link, header, main landmark.
 *
 * Everything here is static, so it is the App Shell every client navigation
 * between the six destinations reuses. The one request-time read — the session
 * — sits under its own Suspense boundary rendering nothing, so it cannot make a
 * navigation block.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const mediaDomains = listMediaDomainChoices();
  return (
    <QueryProvider>
      <NavigationBlockerProvider>
        <UploadProvider
          mediaDomains={mediaDomains}
          directUploadMaxBytes={env.DIRECT_UPLOAD_MAX_BYTES}
        >
          <div className="min-h-dvh">
            <a
              href="#main"
              className="border-border bg-panel sr-only rounded-lg border px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
            >
              Skip to content
            </a>

            <AppHeader />
            <RefreshOnFocus />

            <Suspense fallback={null}>
              <SessionGate />
            </Suspense>

            <main
              id="main"
              className="app-main mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:px-8"
            >
              <Suspense fallback={null}>
                <RouteLayoutMarker />
              </Suspense>
              {children}
            </main>
          </div>
        </UploadProvider>
      </NavigationBlockerProvider>
    </QueryProvider>
  );
}
