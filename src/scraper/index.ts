import puppeteer, { Browser, Page } from "puppeteer";
import { getRandomUserAgent, delay } from "./utils.js";

export interface ScrapingResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export async function scrapeZomatoImage(foodName: string): Promise<ScrapingResult> {
  const query = encodeURIComponent(foodName);
  const url = `https://www.google.com/search?q=${query}+zomato+image&tbm=isch`; // Using Google Images + Zomato filter for better results often
  // Note: Searching directly on Zomato might require more sophisticated bypasses.
  // Let's try Zomato search as requested first, then fallback.

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true, // Use headless for performance
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page: Page = await browser.newPage();
    await page.setUserAgent(getRandomUserAgent());
    await page.setViewport({ width: 1280, height: 800 });

    // Zomato direct search
    const zomatoSearchUrl = `https://www.zomato.com/search?q=${query}`;
    await page.goto(zomatoSearchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Let any remaining AJAX finish
    await delay(3000);

    // Better selection logic as requested by USER
    const imageUrl = await page.evaluate(() => {
      // Look for images that are likely food items
      // Zomato typically uses specific classes or data attributes
      const imgs = Array.from(document.querySelectorAll("img"));

      // Filter for larger images that are likely from Zomato CDN (b.zmtcdn.com)
      const foodImg = imgs.find(img => {
        const src = img.src || "";
        const isZomatoCdn = src.includes("zmtcdn.com");
        const isNotAvatarOrIcon = !src.includes("avatar") && !src.includes("icon");
        const hasGoodSize = (img.naturalWidth || 0) > 100 || (img as any).width > 100;
        return isZomatoCdn && isNotAvatarOrIcon && hasGoodSize;
      });

      return foodImg?.src || null;
    });

    if (!imageUrl) {
        // Fallback: Try a different Zomato pattern
        // Sometimes results are in cards
        const cardImg = await page.evaluate(() => {
               const firstCardImg = document.querySelector('div[data-testid="res-card-image"] img');
               return (firstCardImg as HTMLImageElement)?.src || null;
        });

        if (cardImg) return { success: true, imageUrl: cardImg };
        return { success: false, error: "No suitable image found on Zomato search page" };
    }

    return { success: true, imageUrl };

  } catch (error: any) {
    console.error(`Scraping error: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}
