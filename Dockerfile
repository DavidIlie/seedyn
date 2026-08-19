# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY scripts/copy-ffmpeg-assets.mjs ./scripts/copy-ffmpeg-assets.mjs
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
  APP_URL=https://seedyn.dave.tips \
  CDN_URL=https://i.dave.tips \
  APP_HOSTS=seedyn.dave.tips \
  MEDIA_HOSTS=i.dave.tips \
  DATABASE_URL=postgresql://build:build@127.0.0.1:5432/seedyn-build \
  REDIS_URL=redis://127.0.0.1:6379 \
  MINIO_URL=127.0.0.1 \
  MINIO_PORT=9000 \
  MINIO_SECURE=false \
  MINIO_KEY_ID=seedyn-build \
  MINIO_PASSWORD=seedyn-build-placeholder \
  MINIO_BUCKET=seedyn-build \
  TRUSTED_PROXY_HOPS=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
COPY --from=dependencies /app/public/ffmpeg ./public/ffmpeg
RUN pnpm build

FROM dependencies AS production-dependencies
RUN pnpm prune --prod

FROM base AS runner
WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home-dir /app nextjs \
  && mkdir -p /app/.next/cache /tmp/seedyn-uploads \
  && chown -R nextjs:nodejs /app/.next/cache /tmp/seedyn-uploads

COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts/run-command-with-next-env.mjs ./scripts/run-command-with-next-env.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/production-env-preflight.mjs ./scripts/production-env-preflight.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start-production.mjs ./scripts/start-production.mjs
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/media-domains.js ./src/lib/media-domains.js
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "scripts/start-production.mjs"]
