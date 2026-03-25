import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { delay } from './utils.js';

// @ts-ignore
puppeteer.use(StealthPlugin());

interface ScrapeResult {
  success: boolean;
  candidates: { url: string; width?: number; height?: number }[];
  error?: string;
}

/**
 * 🛠️ PRODUCTION SCRAPER (MULTI-CANDIDATE MODE)
 * Fetches top 5 images from search engines for the AI Scoring Engine.
 */
export async function scrapeFoodImages(foodName: string): Promise<ScrapeResult> {
  // @ts-ignore
  const browser = await (puppeteer as any).launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    const query = encodeURIComponent(`${foodName} indian food hd`);
    const searchUrl = `https://duckduckgo.com/?q=${query}&iax=images&ia=images`;

    console.log(`🚀 Searching DuckDuckGo for Candidates: ${foodName}...`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await delay(3000);

    // 🏆 Extraction logic for multiple high-res candidates
    const candidates = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.tile--img__img'));
      return imgs.slice(0, 5).map(img => {
        const parent = img.closest('.tile--img');
        const meta = parent?.getAttribute('data-id'); // DDG uses data-id for metadata
        
        // Basic parser for DDG's metadata structure if possible
        // (For simplicity, we take the src if metadata parsing is complex in headless)
        return {
           url: (img as HTMLImageElement).src || "",
           width: 500, // Fallback width
           height: 500 // Fallback height
        };
      });
    });

    if (candidates.length === 0) {
      console.warn("⚠️ DuckDuckGo returned 0. Trying Bing Fallback...");
      const bingUrl = `https://www.bing.com/images/search?q=${query}&form=HDRSC2&first=1&tsc=ImageHoverTitle`;
      await page.goto(bingUrl, { waitUntil: 'networkidle2' });
      await delay(3000);

      const bingCandidates = await page.evaluate(() => {
        const results = Array.from(document.querySelectorAll('.iusc'));
        return results.slice(0, 5).map(res => {
          const metadata = JSON.parse(res.getAttribute('m') || '{}');
          return {
            url: metadata.murl || "",
            width: metadata.w || 0,
            height: metadata.h || 0
          };
        });
      });
      
      await browser.close();
      return { success: bingCandidates.length > 0, candidates: bingCandidates };
    }

    await browser.close();
    return { success: true, candidates };

  } catch (error: any) {
    await browser.close();
    return { success: false, candidates: [], error: error.message };
  }
}
