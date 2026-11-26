# syntax=docker/dockerfile:1
#
# One image for the whole LMS (platform console, academy admin, learner app and
# public sites are one Next.js server). Built by Dokploy on the server.
#
# Schema: this project uses `prisma db push`, not migrations. The container
# pushes the schema when it starts and refuses to start if that would lose data
# (no --accept-data-loss), so a destructive schema change has to be applied by
# hand, on purpose.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# postinstall copies the pdf.js worker out of node_modules.
COPY scripts/copy-pdf-worker.mjs ./scripts/copy-pdf-worker.mjs
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Read while building: next.config.ts turns the asset origin into the
# Content-Security-Policy for the sign-in pages, and that is fixed at build
# time. None of these is a secret.
ARG APP_DOMAIN=localhost:3000
ARG PLATFORM_SUBDOMAIN=platform
ARG PRODUCT_NAME="Prisma LMS"
ARG S3_ENDPOINT
ARG S3_PUBLIC_BASE_URL
ARG S3_BUCKET
ARG S3_REGION

# lib/env.ts validates the environment as soon as a route is loaded, which the
# build does. The values below only satisfy that check; they exist for this one
# command, are not stored in the image, and are replaced by the real
# environment when the container runs.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    SESSION_SECRET="build-time-placeholder-only" \
    OTP_PEPPER="build-time-placeholder" \
    PLATFORM_ADMIN_EMAIL="build@example.invalid" \
    PLATFORM_ADMIN_PASSWORD="build-time-placeholder" \
    SMTP_HOST="localhost" SMTP_PORT="25" SMTP_USER="build" SMTP_PASS="build" \
    EMAIL_FROM="build@example.invalid" EMAIL_FROM_NAME="build" \
    npm run build \
  && chown -R node:node /app/.next

FROM build AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
USER node
EXPOSE 3000

# 1. Bring the database schema up to date (stops here if that would lose data).
# 2. Prepare the AI storage tables; if that fails the app does it on first use.
# 3. Serve.
CMD ["sh", "-c", "npx prisma db push && (npx tsx scripts/mastra-init.ts || echo 'AI storage was not prepared; it will be on first use.') && exec npx next start -H 0.0.0.0 -p 3000"]
