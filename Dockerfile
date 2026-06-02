# syntax=docker/dockerfile:1

FROM node:24.16.0-trixie-slim@sha256:45fbb3ca3b6c7e6646cd2889d0ac7bf314bb180036da792221fc2f48fe4d43fb AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
USER 65532:65532
EXPOSE 8080
# The base image's entrypoint is node itself. The migration job reuses this
# image and only swaps the arguments, so the schema and the code that needs it
# always ship in the same digest.
CMD ["dist/server.js"]
