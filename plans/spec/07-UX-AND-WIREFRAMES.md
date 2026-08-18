# 07 — UX and wireframes

Status: **implemented baseline**

## Design direction

The new UI borrows the strongest ideas from `davidapps-auth` and
`webhook-relay`: Geist typography, semantic OKLCH tokens, quiet tinted surfaces,
compact control-panel spacing, tight borders/shadows, explicit focus, restrained
motion, and first-class light/dark/system modes.

It preserves the old ShareX server's information architecture and usefulness,
not its 2021 floating-shape background, client-only loading, oversized animation,
or separate frontend/backend feel.

Principles:

- utility before decoration;
- one primary action per page;
- dense enough to scan, calm enough to leave open;
- actual content or skeletons, never fake totals;
- no dashboard card confetti or gradients without semantic purpose;
- motion communicates state/relationship and respects reduced motion;
- every action works with keyboard and narrow viewports.

## App shell

Wide layout:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  seedyn       Dashboard  Images  Files  Texts  API Keys  Docs       │
│                                                        ◐  David ▾   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  page content                                                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- sticky, translucent/tinted header with one-pixel border;
- simple wordmark; logo can wait;
- active link is unmistakable without a large pill;
- theme toggle and account menu are the only right-side global controls;
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
┌────────────────────────────────────────┐
│ seedyn                                 │
│                                        │
│ Your private upload library            │
│ ShareX-ready links, stored for good.   │
│                                        │
│ [ Continue with DavidApps ]            │
│                                        │
│ Invite-only                            │
└────────────────────────────────────────┘
```

No local email/password fields. Errors return to a specific calm error state
with retry. The page contains no public product dashboard data.

## Dashboard

```text
Dashboard                                             [ Upload ]
Your recent library and ShareX status.

┌ Uploads ─────┐ ┌ Storage ─────┐ ┌ Images ──────┐ ┌ Other ───────┐
│ 1,284        │ │ 8.4 GB       │ │ 912          │ │ 372          │
└──────────────┘ └───────────────┘ └──────────────┘ └──────────────┘

Recent uploads                                  View all
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ preview      │ preview      │ preview      │ preview      │
│ name  [copy] │ name  [copy] │ name  [copy] │ name  [copy] │
└──────────────┴──────────────┴──────────────┴──────────────┘

ShareX
No active key yet. Create one and download a ready-to-import config. [Set up]
```

Stats and recent uploads suspend independently. A slow aggregate never blocks
the upload action or recent list shell.

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
Keys authenticate ShareX and upload tools. Save a new key when it is shown.

Personal ShareX    sdn_live_a1b2c3d4   image, file, text
Last used 3 minutes ago · Never expires             [Download config] [Revoke]
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
2. ShareX quick start.
3. API keys and scopes.
4. Upload API reference.
5. Browser uploads and URL ingest.
6. Copy as GIF.
7. Public URLs, caching, and deletion.
8. Limits and supported media.
9. Troubleshooting/agent access.

## Theme and tokens

Start from Hooker's token approach, renamed for Seedyn. All colors live in one
token file and Fumadocs aliases those tokens. Use `color-scheme` plus
`data-theme=light|dark`; absence follows the OS. Avoid a second neutral palette
inside Fumadocs.

Recommended brand hue is green/teal suggested by “seed”, but this remains a
visual recommendation rather than a product dependency. The old blue-indigo
palette is not binding.

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
