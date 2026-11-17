# Tank Sudda OS production image, run by Cloudflare Containers.
# The app is built before the image (npm run build in CI), so this image only
# installs production dependencies and copies the build output.
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# npm 11 matches the lockfile format used by the project and CI.
RUN npm install -g npm@11 --no-audit --no-fund

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY dist ./dist
COPY server.mjs ./server.mjs

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
