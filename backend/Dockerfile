FROM node:20-bookworm-slim

# Install Chromium system dependencies (used by Playwright for auto-apply)
# playwright install --with-deps handles the apt packages automatically
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Download Chromium and its system deps in one step
RUN npx playwright install --with-deps chromium

COPY . .

EXPOSE 3001
CMD ["node", "src/index.js"]
