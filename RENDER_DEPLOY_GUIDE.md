# 🔱 Kravy AI | Render Deployment Guide

Follow these exact settings to ensure your Scraper Engine deploys successfully on Render.

## 1. Render Dashboard Settings

| Field | Setting | Reason |
| :--- | :--- | :--- |
| **Root Directory** | **EMPTY (Blank)** | `package.json` is at the top level. Do NOT set to `src`. |
| **Build Command** | `npm install && npm run build` | Installs deps, generates Prisma types, and compiles TS. |
| **Start Command** | `node dist/server.js` | Runs the compiled Express server. |

## 2. Environment Variables (Required)

Ensure these are added in the **Environment** tab of your Render service:

- `DATABASE_URL`: Your MongoDB Connection String.
- `CLOUDINARY_URL`: Or individual Cloudinary API keys.
- `SCRAPER_SECRET_KEY`: `kravy_scraper_secret_2026`
- `PORT`: `3000` (Render usually sets this automatically).

## 3. Puppeteer Considerations

- Render's **Web Service** environment (Ubuntu) supports Puppeteer, but it requires the official **Puppeteer Buildpack** or a Dockerfile.
- **Tip:** If using Render's standard environment, add the `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` variable if you're using an external browser, BUT for this project, just let Render install Chromium.

## 4. Verification

Once deployed, visit your Render URL. You should see the **Kravy AI Scraper** dashboard. If you see "Blank", check the browser console for any CORS errors.

---

### ✅ Success Pathway
1. Push latest code (already done).
2. Set Root Directory to **Blank**.
3. Use Build Command: `npm install && npm run build`.
4. Run `node dist/server.js`.
