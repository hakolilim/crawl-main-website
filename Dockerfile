# Playwright base image — version MUST match package-lock.json (playwright@1.61.1)
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

# Install dependencies from lockfile for reproducible builds
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source
COPY . .

# Build Next.js (NEXT_PUBLIC_* env vars must be available at build time on Render)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime defaults for Render
ENV NODE_ENV=production
ENV PORT=10000
ENV HOSTNAME=0.0.0.0
ENV PLAYWRIGHT_HEADLESS=true

EXPOSE 10000

# Bind 0.0.0.0 so Render can route traffic; respect $PORT
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-10000}"]
