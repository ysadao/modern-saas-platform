FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

FROM node:22-alpine AS web
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY web ./web
RUN npx vite build --config web/vite.config.ts

FROM node:22-alpine AS api
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npx tsc -p tsconfig.json

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3101
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate
COPY --from=api /app/dist ./dist
COPY --from=web /app/web/dist ./web/dist
EXPOSE 3101
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
