FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317 LP_DATA_DIR=/app/data
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir data && chown node:node data
USER node
EXPOSE 4317
VOLUME ["/app/data"]
CMD ["node", "dist/server/index.js"]
