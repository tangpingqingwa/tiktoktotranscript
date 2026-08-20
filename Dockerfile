# One-box image. Listen on $PORT. Do not bake CLIPAPI_BASE or CLIPAPI_KEY.
# Cutover is an operator step: point CLIPAPI_BASE at a live ClipAPI box.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# tsx is a devDependency; production start is `node --import tsx src/server.ts`.
RUN npm ci && npm cache clean --force

COPY src ./src
COPY public ./public
COPY tsconfig.json ./

RUN chown -R node:node /app

USER node

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "src/server.ts"]
