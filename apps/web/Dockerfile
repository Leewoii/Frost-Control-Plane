FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm install --workspace apps/web --include-workspace-root
COPY tsconfig.base.json ./
COPY apps/web apps/web
EXPOSE 5173
CMD ["npm", "--workspace", "apps/web", "run", "dev"]
