# เศรษฐีสยาม — single image: game server + built TV & phone SPAs on ONE port.
FROM node:20-bookworm-slim
WORKDIR /app

# Install deps first (cached until any package.json changes).
COPY package.json package-lock.json ./
COPY apps/tv/package.json apps/tv/
COPY apps/phone/package.json apps/phone/
COPY apps/server/package.json apps/server/
COPY packages/rules/package.json packages/rules/
COPY packages/shared/package.json packages/shared/
RUN npm install

# Bring in the source and build both static frontends (server runs via tsx).
COPY . .
RUN npm run build

# Single origin: the server serves the TV board, the phone controller, AND the
# Socket.IO endpoint here. No other ports needed — perfect behind a CF tunnel.
ENV PORT=4000
EXPOSE 4000

# Container-level health so `docker compose` / the tunnel know when we're ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "scripts/docker-start.sh"]
