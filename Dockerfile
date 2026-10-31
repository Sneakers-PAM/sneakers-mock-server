# syntax=docker/dockerfile:1
# The Sneakers mock gateway: the whole gateway API in memory on port 5171, with its controls at
# /_mock. It runs from the TypeScript sources through vite-node, so there's no build stage.
#   docker build -t sneakers-mock-server .
#   docker run --rm -p 5171:5171 sneakers-mock-server
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE}
ENV NODE_ENV=production
# Inside a container the port mapping is the boundary, not loopback.
ENV HOST=0.0.0.0
# vite-node writes beside its config and into node_modules/.vite, so the app runs as its owner.
RUN mkdir /app && chown node:node /app
WORKDIR /app
USER node
COPY --chown=node:node package.json ./
COPY --chown=node:node packages/mock-gateway/package.json packages/mock-gateway/
COPY --chown=node:node packages/gateway-client/package.json packages/gateway-client/
COPY --chown=node:node packages/vite-config/package.json packages/vite-config/
COPY --chown=node:node packages/contract-tests/package.json packages/contract-tests/
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node bin bin
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node packages/mock-gateway packages/mock-gateway
COPY --chown=node:node packages/gateway-client/src packages/gateway-client/src
EXPOSE 5171
CMD ["node", "bin/sneakers-mock-server.mjs", "--port", "5171"]
