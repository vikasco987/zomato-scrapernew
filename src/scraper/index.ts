import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
puppeteer.use(StealthPlugin());

interface ScrapeResult {
  success: boolean;
  candidates: { url: string; width?: number; height?: number }[];
  error?: string;
}

/**
 * 🛠️ PRODUCTION SCRAPER (MULTI-CANDIDATE MODE)
 * Uses high-speed selector waiting (no arbitrary delays)
 */
export async function scrapeFoodImages(foodName: string): Promise<ScrapeResult> {
  // @ts-ignore
  const browser = await (puppeteer as any).launch({ 
    headless: "new",
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ] 
  });
  const page = await browser.newPage();
  
  // 🔥 Time-to-Live settings (Increased for production/cloud stability)
  await page.setDefaultNavigationTimeout(45000);

  try {
    const query = encodeURIComponent(`${foodName} indian food hd`);
    const searchUrl = `https://duckduckgo.com/?q=${query}&iax=images&ia=images`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    
    // ⚡ FASTER: Wait for selector instead of delay
    try {
        await page.waitForSelector('.tile--img__img', { timeout: 4000 });
    } catch (e) {
        // Fallback or ignore
    }

    const candidates = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.tile--img__img'));
      return imgs.slice(0, 5).map(img => ({
           url: (img as HTMLImageElement).src || "",
           width: 500,
           height: 500
      }));
    });

    if (candidates.length === 0) {
      const bingUrl = `https://www.bing.com/images/search?q=${query}&first=1`;
      await page.goto(bingUrl, { waitUntil: 'domcontentloaded' });
      
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
      });
      
      await browser.close();
      return { success: bingCandidates.length > 0, candidates: bingCandidates.filter((c: any) => c.url) };
    }

    await browser.close();
    return { success: true, candidates };

  } catch (error: any) {
    await browser.close();
    return { success: false, candidates: [], error: error.message };
  }
}
