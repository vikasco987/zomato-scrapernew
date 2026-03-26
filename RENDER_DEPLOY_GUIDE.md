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
- `PROXY_LIST`: (Optional) Comma separated proxy list. e.g. `http://user:pass@host1:port,http://user:pass@host2:port`
- `PORT`: `3000` (Render usually sets this automatically).

## 3. Puppeteer & Proxy Rotation

- Render's **Web Service** environment (Ubuntu) supports Puppeteer.
- **Proxy Chain:** The system now automatically "Anonymizes" proxy credentials, so you can safely use paid residential proxies.
- **Smart Jitter:** Scraper adds random 1-4s delays to mimic human interaction.

## 4. Verification

Once deployed, visit your Render URL. You should see the **Kravy AI Scraper** dashboard. If you see "Blank", check the browser console for any CORS errors.

---

### ✅ Success Pathway
1. Push latest code (already done).
2. Set Root Directory to **Blank**.
3. Use Build Command: `npm install && npm run build`.
4. Run `node dist/server.js`.
