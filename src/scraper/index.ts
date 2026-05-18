import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { anonymizeProxy } from 'proxy-chain';
import { randomJitter, getRandomUserAgent, cleanDishName } from './utils.js';

// @ts-ignore
// @ts-ignore
puppeteer.use(StealthPlugin());

let sharedBrowser: any = null;
let browserPromise: Promise<any> | null = null;

/**
 * 🔒 SHARED BROWSER INSTANCE (With Atomic Initialization Lock)
 */
async function getBrowser() {
  if (sharedBrowser) return sharedBrowser;
  if (browserPromise) return browserPromise;

  browserPromise = (async () => {
    try {
      const proxyList = (process.env.PROXY_LIST || "").split(",").filter(Boolean);
      const launchArgs = [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--hide-scrollbars',
        '--window-size=1280,800'
      ];
      
      if (proxyList.length > 0) {
        const rawProxy = proxyList[Math.floor(Math.random() * proxyList.length)];
        const finalProxy = await anonymizeProxy(rawProxy);
        launchArgs.push(`--proxy-server=${finalProxy}`);
      }

      // @ts-ignore
      sharedBrowser = await (puppeteer as any).launch({ 
        headless: "new", 
        args: launchArgs,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined 
      });

      // Handle unexpected disconnection
      sharedBrowser.on('disconnected', () => {
          console.warn("⚠️ [Scraper] Shared browser disconnected. Resetting...");
          sharedBrowser = null;
          browserPromise = null;
      });

      return sharedBrowser;
    } catch (err) {
      browserPromise = null;
      throw err;
    }
  })();

  return browserPromise;
}

export async function closeBrowser() {
    if (sharedBrowser) {
        await sharedBrowser.close();
        sharedBrowser = null;
    }
}

interface ScrapeResult {
  success: boolean;
  candidates: { url: string; width?: number; height?: number }[];
  error?: string;
}

/**
 * 🛠️ PRODUCTION SCRAPER (TRIPLE FALLBACK: DDG -> BING -> GOOGLE)
 * 🚀 PERFORMANCE BOOST: Reuses shared browser instance.
 */
export async function scrapeFoodImages(foodName: string, categoryName: string | null = null): Promise<ScrapeResult> {
  let page: any = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    await page.setUserAgent(getRandomUserAgent());
    await page.setDefaultNavigationTimeout(45000);

    const cleanName = cleanDishName(foodName);
    
    // 🥤 SMART BEVERAGE DETECTION
    const beverageKeywords = ['tea', 'coffee', 'chai', 'pepsi', 'coke', 'coca-cola', 'cola', 'drink', 'juice', 'shake', 'lassi', 'mocktail', 'cocktail', 'cold drink', 'soda', 'water', 'limca', 'sprite', 'fanta', 'dew', 'thumbs up'];
    const isBeverage = beverageKeywords.some(k => cleanName.toLowerCase().includes(k));
    
    const isPizza = (categoryName?.toLowerCase().includes('pizza')) || (cleanName.toLowerCase().includes('pizza'));
    
    // 4. Reject Non-Food Noise (-25 for UI/Stock elements - INCREASED PENALTY)
    const noiseKeywords = ["logo", "icon", "banner", "placeholder", "default", "avatar", "stock", "alamy", "shutterstock", "dreamstime", "watermark", "text", "price", "label"];
    
    let searchTerms = isBeverage 
        ? `${cleanName} drink glass`
        : `${cleanName} dish food`;

    if (isPizza) {
        // Force the word "pizza" and "italian" to avoid getting generic curry images for "Karahi Paneer Pizza"
        searchTerms = `${cleanName} italian pizza food`;
    }
        
    const query = encodeURIComponent(searchTerms);

    console.log(`🔍 [${foodName}] Searching for: ${searchTerms} (isBeverage: ${isBeverage})`);

    // --- FALLBACK 1: DuckDuckGo ---
    const ddgUrl = `https://duckduckgo.com/?q=${query}&iax=images&ia=images`;
    await page.goto(ddgUrl, { waitUntil: 'domcontentloaded' });
    await randomJitter(800, 1500);
    let candidates = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.tile--img__img')).slice(0, 5).map(img => ({
           url: (img as HTMLImageElement).src || "", width: 500, height: 500
      }));
    }).then((res: any[]) => res.filter((c: any) => c.url && !c.url.includes('data:image')));

    if (candidates.length > 0) console.log(`✅ [${foodName}] Found ${candidates.length} candidates on DuckDuckGo.`);

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

    await page.close();
    return { success: candidates.length > 0, candidates };

  } catch (error: any) {
    console.error(`❌ SCRAPE_CRASH [${foodName}]: ${error.message}`);
    if (page) await page.close();
    return { success: false, candidates: [], error: error.message };
  }
}
