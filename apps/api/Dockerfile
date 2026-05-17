FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm install --workspace apps/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm --workspace packages/core run build && npm --workspace apps/api run build
EXPOSE 4310
CMD ["npm", "--workspace", "apps/api", "run", "start"]
