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
 * 🛠️ PRODUCTION SCRAPER (WITH PROXY ROTATION & JITTER)
 */
export async function scrapeFoodImages(foodName: string): Promise<ScrapeResult> {
  const proxyList = (process.env.PROXY_LIST || "").split(",").filter(Boolean);
  let browser: any = null;
  let finalProxy: string | null = null;

  try {
    // 1. Pick a Random Proxy and Anonymize it
    if (proxyList.length > 0) {
      const rawProxy = proxyList[Math.floor(Math.random() * proxyList.length)];
      finalProxy = await anonymizeProxy(rawProxy);
      console.log(`🔗 MASKED PROXY ACTIVE: [${finalProxy.split('@').pop()}]`);
    }

    // 2. Launch with Jitter & Proxy
    const launchArgs = [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ];
    if (finalProxy) launchArgs.push(`--proxy-server=${finalProxy}`);

    // @ts-ignore
    browser = await (puppeteer as any).launch({ 
      headless: "new",
      args: launchArgs
    });

    const page = await browser.newPage();
    await page.setUserAgent(getRandomUserAgent());
    await page.setDefaultNavigationTimeout(45000);

    // 3. START JITTER (Wait like a human)
    await randomJitter(1000, 3000);

    const query = encodeURIComponent(`${foodName} indian food hd`);
    const searchUrl = `https://duckduckgo.com/?q=${query}&iax=images&ia=images`;

    console.log(`📡 Searching: ${foodName} (through proxy flow)`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    
    await randomJitter(500, 1500); // Wait for results to manifest

    try {
        await page.waitForSelector('.tile--img__img', { timeout: 4000 });
    } catch (e) {}

    const candidates = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.tile--img__img'));
      return imgs.slice(0, 5).map(img => ({
           url: (img as HTMLImageElement).src || "",
           width: 500,
           height: 500
      }));
    });

    // 4. Fallback To Bing with Proxy Rotation if needed
    if (candidates.length === 0) {
      console.log(`🔄 DuckDuckGo Empty. Falling back to Bing...`);
      const bingUrl = `https://www.bing.com/images/search?q=${query}&first=1`;
      await page.goto(bingUrl, { waitUntil: 'domcontentloaded' });
      await randomJitter(1000, 2000);
      
      try {
        await page.waitForSelector('.iusc', { timeout: 4000 });
      } catch (e) {}

      const bingCandidates = await page.evaluate(() => {
        const results = Array.from(document.querySelectorAll('.iusc'));
        return results.slice(0, 5).map(res => {
          const m = res.getAttribute('m');
          if(!m) return { url: "", width:0, height: 0 };
          const metadata = JSON.parse(m);
          return {
            url: metadata.murl || "",
            width: metadata.w || 0,
            height: metadata.h || 0
          };
        });
      }).then((res: any[]) => res.filter((c: any) => c.url));
      
      await browser.close();
      return { success: bingCandidates.length > 0, candidates: bingCandidates };
    }

    await browser.close();
    return { success: true, candidates: candidates.filter((c: any) => c.url) };

  } catch (error: any) {
    console.error(`❌ PROXY SCRAPE FAILED: ${error.message}`);
    if (browser) await browser.close();
    return { success: false, candidates: [], error: error.message };
  }
}
