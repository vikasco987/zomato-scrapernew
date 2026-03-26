import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { anonymizeProxy } from 'proxy-chain';
import { randomJitter, getRandomUserAgent } from './utils.js';

// @ts-ignore
puppeteer.use(StealthPlugin());

interface ScrapeResult {
  success: boolean;
  candidates: { url: string; width?: number; height?: number }[];
  error?: string;
}

/**
 * 🛠️ PRODUCTION SCRAPER (TRIPLE FALLBACK: DDG -> BING -> GOOGLE)
 */
export async function scrapeFoodImages(foodName: string): Promise<ScrapeResult> {
  const proxyList = (process.env.PROXY_LIST || "").split(",").filter(Boolean);
  let browser: any = null;
  let finalProxy: string | null = null;

  try {
    if (proxyList.length > 0) {
      const rawProxy = proxyList[Math.floor(Math.random() * proxyList.length)];
      finalProxy = await anonymizeProxy(rawProxy);
    }

    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
    if (finalProxy) launchArgs.push(`--proxy-server=${finalProxy}`);

    // @ts-ignore
    browser = await (puppeteer as any).launch({ headless: "new", args: launchArgs });
    const page = await browser.newPage();
    await page.setUserAgent(getRandomUserAgent());
    await page.setDefaultNavigationTimeout(45000);

    const query = encodeURIComponent(`${foodName} dish food hd`);

    // --- FALLBACK 1: DuckDuckGo ---
    const ddgUrl = `https://duckduckgo.com/?q=${query}&iax=images&ia=images`;
    await page.goto(ddgUrl, { waitUntil: 'domcontentloaded' });
    await randomJitter(800, 1500);
    let candidates = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.tile--img__img')).slice(0, 5).map(img => ({
           url: (img as HTMLImageElement).src || "", width: 500, height: 500
      }));
    }).then((res: any[]) => res.filter((c: any) => c.url && !c.url.includes('data:image')));

    // --- FALLBACK 2: Bing ---
    if (candidates.length === 0) {
      console.log(`🔄 [${foodName}] DDG Empty. Trying Bing...`);
      const bingUrl = `https://www.bing.com/images/search?q=${query}&first=1`;
      await page.goto(bingUrl, { waitUntil: 'domcontentloaded' });
      await randomJitter(1000, 2000);
      candidates = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.iusc')).slice(0, 5).map(res => {
          const m = res.getAttribute('m');
          if(!m) return null;
          const metadata = JSON.parse(m);
          return { url: metadata.murl || "", width: metadata.w || 0, height: metadata.h || 0 };
        }).filter(x => x);
      }) as any;
    }

    // --- FALLBACK 3: Google (Direct JSON/Script extraction) ---
    if (candidates.length === 0) {
      console.log(`🔄 [${foodName}] Bing Empty. Trying Google...`);
      const googleUrl = `https://www.google.com/search?tbm=isch&q=${query}`;
      await page.goto(googleUrl, { waitUntil: 'domcontentloaded' });
      await randomJitter(1000, 2000);
      candidates = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).slice(5, 15).map(img => ({
           url: img.src || img.dataset.src || "", width: 400, height: 400
        })).filter(c => c.url && c.url.startsWith('http'));
      });
    }

    await browser.close();
    return { success: candidates.length > 0, candidates };

  } catch (error: any) {
    console.error(`❌ SCRAPE_CRASH [${foodName}]: ${error.message}`);
    if (browser) await browser.close();
    return { success: false, candidates: [], error: error.message };
  }
}
