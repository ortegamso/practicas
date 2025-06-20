# Install dependencies only when needed
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm install

# Rebuild the source code only when needed
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image, copy all the files and run next
FROM node:18-alpine AS runner
WORKDIR /usr/src/app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /usr/src/app/public ./public
COPY --from=builder --chown=nextjs:nodejs /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

USER nextjs

EXPOSE ${PORT:-3000}
ENV PORT 3000

CMD ["npm", "start"]
