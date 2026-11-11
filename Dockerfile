FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM dependencies AS runtime-dependencies
# External imports of Nitro, the jobs bundle and the entrypoint, including
# the SQLite backend that Sidequest loads by name.
RUN node --input-type=commonjs -e 'const fs = require("node:fs"); \
  const pkg = require("./package.json"); \
  const runtime = ["sidequest", "@sidequest/sqlite-backend", "better-sqlite3", "drizzle-orm", "client-zip", "mime", "zod"]; \
  pkg.dependencies = Object.fromEntries(runtime.map(name => [name, pkg.dependencies[name]])); \
  delete pkg.devDependencies; \
  fs.writeFileSync("package.json", JSON.stringify(pkg));' \
  && npm prune --offline --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/.jobs ./.jobs
COPY --from=build /app/drizzle ./drizzle
COPY entrypoint.sh /entrypoint.sh
COPY package.json ./
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_URL=/data/database.sqlite SIDEQUEST_DATABASE_URL=/data/sidequest.sqlite STORAGE_PATH=/data/storage
VOLUME ["/data"]
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
