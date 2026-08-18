# 07 — UX and wireframes

Status: **implemented and browser-verified**

## Design direction

The final UI intentionally does not reuse the DavidApps Auth identity. Its
working direction is **Paper Shelf**: IBM Plex Sans/Mono, near-neutral warm
paper/ink surfaces, hairline ledger rules, compact file-native density, and one
ember accent reserved for primary action, focus, active navigation, and the
canonical URL marker.

It preserves the old upload server's useful categories and compatibility, not
its ShareX-first product framing, 2021 floating-shape background, client-only
loading, oversized animation, or separate frontend/backend feel.

Principles:

- utility before decoration;
- one primary action per page;
- dense enough to scan, calm enough to leave open;
- actual content or skeletons, never fake totals;
- no dashboard card confetti, gradients, or nested-card stacks;
- motion communicates state/relationship and respects reduced motion;
- every action works with keyboard and narrow viewports.
- labels are literal (`Recent`, not `Shelf`); ShareX appears only as an
  integration.

## App shell

Wide layout:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  seedyn         Recent  Images  Files  Texts  API Keys  Docs  Sign out │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  page content                                                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- sticky background header with one-pixel border;
- simple wordmark; logo can wait;
- active link is unmistakable without a large pill;
- Upload appears in page headers, not as an always-floating button.

Narrow layout:

```text
┌──────────────────────────┐
│ seedyn          Upload ☰ │
├──────────────────────────┤
│ page title               │
│ content / rows           │
└──────────────────────────┘
```

The disclosure is a native accessible control. No viewport width JavaScript.

## Sign-in

```text
seedyn

Files that need a URL
Upload from the browser or any program. Seedyn stores the object and
gives it a permanent public-by-link URL.

[ Continue with DavidApps ]

Invite-only. Accounts are granted through DavidApps.
```

No local email/password fields. Errors return to a specific calm error state
with retry. The page contains no public product dashboard data.

## Recent

```text
Recent                                                [ Upload ]
1,284 uploads · 8.4 GB stored

Recent uploads
────────────────────────────────────────────────────────────
[preview] screenshot.png        1.4 MB · 2 minutes ago [Copy]
[FILE]    report.pdf            2.2 MB · yesterday     [Copy]
────────────────────────────────────────────────────────────
```

Totals and recent uploads suspend independently. A slow aggregate never blocks
the upload action or the recent-list shell. No integration onboarding competes
with the primary upload/store/serve job.

## Library page

```text
Images                                                [ Upload image ]
Screenshots and other image uploads.

[ Search filename…                       ] [Newest ▾]

┌ preview ┐  screenshot.png        1.4 MB   2 minutes ago
│         │  https://cdn.../abc.png      [Copy URL] [•••]
└─────────┘
...

                                      [ Load more ]
```

- Rows on wide screens, compact preview cards on narrow screens.
- Copy has visible `Copied` state announced through an aria-live region.
- Broken preview shows type icon and metadata; never collapses the row.
- Search/order live in the URL and are server-rendered.
- Empty state adapts: no uploads versus no search results.

## Upload dialog

```text
Upload
┌──────────────────────────────────────────────┐
│ Drop a file, paste, or choose one            │
│                                              │
│ [ Choose file ]                              │
│                                              │
│ — or —                                       │
│ [ https://…                              ]   │
└──────────────────────────────────────────────┘

selected-file.png · image/png · 1.4 MB
[██████████████░░░░] 72%                    Cancel
```

- Native dialog or proven accessible dialog primitive.
- Drag/drop is an enhancement; file input always works.
- URL errors distinguish invalid URL, CORS blocked, unsupported MIME, and size.
- Closing during active upload asks before aborting.
- Successful upload gives Copy URL and View upload.

## Upload detail and GIF action

```text
← Images

┌────────────────────────────┐  screenshot.png
│                            │  PNG image · 1.4 MB · 1920×1080
│          preview           │  Uploaded 2 minutes ago
│                            │
└────────────────────────────┘  Original URL
                                [ https://cdn.../abc.png ] [Copy]

                                GIF
                                No stored GIF yet.
                                [ Convert and copy as GIF ]

                                SHA-256  8fd…
                                [ Download original ] [ Delete… ]
```

During conversion:

```text
Preparing GIF locally
Loading converter (31 MB)… / Converting frame 42… / Uploading 68%…
[ Cancel ]
```

After conversion, the GIF row becomes a normal permanent URL with Preview, Copy,
and Download. The action wording never implies the clipboard contains a file;
it copies a `.gif` URL.

## API keys

```text
API Keys                                           [ Create key ]
Create a scoped key for a script, desktop tool, or another HTTP client.

My uploader        sdn_live_a1b2c3d4   image, file, text
Last used 3 minutes ago · Never expires                              [Revoke]
```

`Download config` for an old row cannot include the secret and therefore either
means a secret-free template or is absent. The complete config is offered only
in the one-time creation reveal.

Creation reveal:

```text
Save this key now
It will not be shown again.

[ sdn_live_a1b2…                              ] [Copy]
[ Download Seedyn.sxcu ]

[ I saved it ]
```

No celebratory confetti; the security consequence is the focus.

## Docs

Use Fumadocs layouts, themed to the same semantic tokens. Desktop has docs tree,
content, and table of contents; mobile has accessible drawers. Top app navigation
remains recognizable, but do not nest two competing full headers.

Docs pages:

1. Overview.
2. Browser uploads and URL ingest.
3. Upload API reference.
4. API keys and scopes.
5. Serving objects: public URLs, caching, ranges, and deletion.
6. Copy as GIF.
7. ShareX setup.
8. Compatibility endpoints.
9. Security model.
10. Operations and agent access.

## Theme and tokens

All colors live in one token file and Fumadocs aliases those tokens. Use the
operating-system color scheme without a second client theme provider. The final
palette is the same low-chroma warm ramp at two lightness ranges, with ember as
the only brand/action hue and separate semantic tones for docs callouts.

## Accessibility acceptance

- Visible skip link.
- Landmarks and one `h1` per page.
- 44px practical pointer targets on touch surfaces.
- Every icon button has an accessible name and tooltip where useful.
- Dialog focus trap/restore and Escape behavior.
- Menus operate with keyboard and close predictably.
- Status/progress announced without noisy repeated output.
- Color never carries status alone; contrast meets WCAG AA.
- Reduced motion removes nonessential transitions and conversion animation.
- Skeletons are hidden from assistive tech and paired with meaningful status.
