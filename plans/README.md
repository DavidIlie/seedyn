# Seedyn planning dossier

Status: **implemented local baseline; production infrastructure deferred**
Last updated: **2026-08-18**

This directory records the product, architecture, and acceptance baseline that
the implemented Next.js 16.3 application follows. The former T3-style scaffold
has been replaced; historical discovery language remains only where it explains
why a decision was made.

The application build is complete locally. Production DavidApps provisioning,
home-cluster GitOps, backup validation, and external ingress proof remain a
separately authorized deployment phase.

## Reading order

1. [`PLAN.md`](./PLAN.md) — product thesis, constraints, and recommended system.
2. [`DECISIONS.md`](./DECISIONS.md) — locked decisions and the interview log.
3. [`spec/00-INDEX.md`](./spec/00-INDEX.md) — detailed specification map.
4. The numbered files in `spec/`, in order.
5. [`BUILD-RESULTS.md`](./BUILD-RESULTS.md) — implemented surface and verified
   gates.

## Status vocabulary

- **Locked**: David answered it or the repository/platform contract dictates it.
- **Recommended**: the working design; it becomes locked unless the interview
  turns up a reason to change it.
- **Open**: materially changes behavior or architecture and still needs David's
  answer.
- **Deferred**: explicitly outside V1; a builder must not add it opportunistically.

## Ground rules for the planning interview

- Ask one consequential question at a time.
- Answer anything discoverable from `seedyn`, `sharex-upload-server`,
  `davidapps-auth`, `webhook-relay`, `zerocut`, `home-cluster`, or
  `davidapps-cluster` by inspection instead of asking David.
- Record each answer in `DECISIONS.md` and update every affected spec in the
  same pass.
- Do not provision auth, create buckets, edit cluster GitOps, decrypt secrets,
  or replace the application scaffold during planning.
- Do not write the one-shot build prompt while any launch-blocking item remains
  open.

## Current headline

Seedyn is one self-hosted Next.js application with two public origins:

- `seedyn.dave.tips` — invite-only application and protected docs.
- `i.dave.tips` — short public-by-link immutable media delivery.

The application owns authentication, the upload library, a general HTTP upload
API with optional ShareX compatibility, the public media gateway, and protected
Fumadocs documentation. PostgreSQL owns metadata; a private MinIO bucket owns
bytes. Media-to-GIF conversion happens in the browser and the result is uploaded
once as a permanent stored derivative.

David confirmed both hostnames. `dave.tips` and its wildcard are already routed
through home-cluster, and the separate media origin keeps uploaded content away
from authentication cookies.
