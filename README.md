# 🚀 Zomato Food Image Scraper (1-Click System)

This project is a high-performance, robust scraper for Zomato food images. It includes:
* **Prisma Integration**: Keeps track of scraping status (pending, completed, failed) in a local SQLite database.
* **Smart Filtering**: Uses advanced selector logic to find the most relevant food images (ignoring avatars, icons, etc).
* **Automatic Download**: Images are saved locally for stability (no broken URLs).
* **Retry + Backoff Logic**: Automatically retries failed attempts with exponential delay to avoid blocking.
* **ESM & TypeScript**: Modern codebase structure.

## 🛠️ Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Sync Database**:
   ```bash
   npm run db:push
   ```

## 🚀 Usage

To start scraping images (defined in `src/index.ts`):
```bash
npm run dev
```

## 📂 Project Structure

* `src/index.ts` - **The Orchestrator**: Manages the flow, retries, and database updates.
* `src/scraper/index.ts` - **The Engine**: Puppeteer logic for Zomato.
* `src/downloader/index.ts` - **The Saver**: Downloads images to the `/images` folder.
* `src/db/index.ts` - **The Data Layer**: Prisma client configuration.

## 📊 Monitoring

You can view the scraped records and status using Prisma Studio:
```bash
npm run db:studio
```

## ⚠️ Important Note
This tool is for educational purposes. Always respect Zomato's Terms of Service and `robots.txt`.
