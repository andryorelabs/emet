# The emet Website: built with bun, served by nginx.
# Build context is the repo root: docker build -f apps/site/Dockerfile .
# .dockerignore keeps the context to the workspace manifests, apps/site and the
# allowlisted docs; a new workspace needs its package.json copied below.
FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS build
WORKDIR /repo

COPY package.json bun.lock ./
COPY apps/site/package.json apps/site/package.json
RUN bun install --frozen-lockfile --filter @emet/site --ignore-scripts

COPY apps/site apps/site
COPY docs docs
COPY CHANGELOG.md CHANGELOG.md
RUN bun run --cwd apps/site build

FROM nginx:1.31-alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11
RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/site/docker/nginx.conf /etc/nginx/nginx.conf
COPY apps/site/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY apps/site/docker/site.conf /etc/nginx/conf.d/site.conf
COPY --from=build /repo/apps/site/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
