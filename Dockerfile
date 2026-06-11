# เศรษฐีสยาม — single image running server + TV + phone for LAN play.
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

# Bring in the source and build the two static frontends (server runs via tsx).
COPY . .
RUN npm run build

# 4000 = game server (Socket.IO) · 5173 = TV board · 5174 = phone controller
EXPOSE 4000 5173 5174

CMD ["sh", "scripts/docker-start.sh"]
