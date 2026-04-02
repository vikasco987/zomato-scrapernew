# --- PRODUCTION DOCKERFILE ---
FROM node:20-slim

# Step 1: Install Chrome & Puppeteer Dependencies for Linux
RUN apt-get update && apt-get install -y \
    chromium \
    libgbm-dev \
    libnss3 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Step 2: Set Chrome Environment Variables (Crucial for Scraper)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Step 3: App Setup
WORKDIR /app
COPY package*.json ./
RUN npm install

# Step 4: Copy Code & Prisma
COPY . .
RUN npx prisma generate
RUN npm run build

# Step 5: Expose Dashboard Port
EXPOSE 3000

# Step 6: Start Dashboard + Orchestrator
# We use concurrently via npm run dev or a custom start script
CMD ["npm", "run", "dev"]
