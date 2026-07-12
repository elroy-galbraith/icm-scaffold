FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src

ENTRYPOINT ["npx", "tsx", "src/cli.ts"]
CMD ["status", "--workspace", "/workspace"]
