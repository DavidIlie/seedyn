import { RootProvider } from "fumadocs-ui/provider/next";

/** Keep Fumadocs' client contexts out of the upload tool's non-doc routes. */
export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RootProvider search={{ enabled: false }} theme={{ enabled: false }}>
      {children}
    </RootProvider>
  );
}
