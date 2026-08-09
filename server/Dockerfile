# SIPROCOM SGS API
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
# `npm ci` is deliberate: it installs the exact lockfile versions, so the image
# cannot silently pick up a different dependency than the one that was tested.
RUN npm ci --omit=dev && npx prisma generate

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run unprivileged. A container compromise should not carry root with it.
RUN addgroup -S sgs && adduser -S sgs -G sgs

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=sgs:sgs . .

USER sgs
EXPOSE 4000

# Reports unhealthy while the database is unreachable, so the orchestrator
# restarts rather than serving 500s indefinitely.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/api/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.exit(JSON.parse(d).db?0:1))}).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
