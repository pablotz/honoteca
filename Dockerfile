FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production PORT=8849 DATA_DIR=/data TRUST_PROXY=1
EXPOSE 8849
CMD ["node", "server/index.js"]
