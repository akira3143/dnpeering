# Build Stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage (Ultra-light Standalone Node Server with API Support)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80

# Install Python for registry sync scripts
RUN apk add --no-cache python3 openssh-keygen

# Create non-root user for security
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package*.json ./

# Ensure data directory exists and is writable by app user
RUN mkdir -p server/data && chown -R app:app server/data

USER app

EXPOSE 80
CMD ["node", "server.js"]
