import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PrismaClient } from "@prisma/client";
import { getRandomUserAgent, randomJitter } from "../scraper/utils.js";
import { emitUpdate } from "../lib/socket.js";

const prisma = new PrismaClient();
// @ts-ignore
puppeteer.use(StealthPlugin());

export async function scrapeZomatoMenu(restaurantUrl: string) {
  let browser: any = null;
  try {
    // 1. Normalize URL to the "order" page
    let targetUrl = restaurantUrl.split('?')[0];
    if (!targetUrl.endsWith('/order')) {
      targetUrl = targetUrl.replace(/\/$/, '') + '/order';
    }

    console.log(`🔍 [Zomato Scraper] Launching browser for: ${targetUrl}`);
    emitUpdate('scraper:log', { message: `🔍 [PUPPETEER] LAUNCHING HEADLESS ENGINE...`, status: 'primary' });

    browser = await (puppeteer as any).launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    emitUpdate('scraper:log', { message: `🌐 [PUPPETEER] BROSWER PAGE ACTIVE`, status: 'primary' });
    await page.setUserAgent(getRandomUserAgent());
    await page.setViewport({ width: 1280, height: 800 });

    // 2. Go to the menu page and wait for content
    emitUpdate('scraper:log', { message: `🛰️ [PUPPETEER] NAVIGATING TO: ${targetUrl}`, status: 'primary' });
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    emitUpdate('scraper:log', { message: `✅ [PUPPETEER] PAGE CONTENT LOADED`, status: 'success' });

    // 3. Scroll to trigger lazy-loaded images
    console.log(`🖱️ [Zomato Scraper] Scrolling to load images...`);
    emitUpdate('scraper:log', { message: `🖱️ [PUPPETEER] SCROLLING TO TRIGGER LAZY-LOADS...`, status: 'primary' });
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 300;
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve(true);
          }
        }, 150);
      });
    });
    emitUpdate('scraper:log', { message: `✅ [PUPPETEER] SCROLLING COMPLETE`, status: 'success' });

    await randomJitter(2000, 3000);

    // 4. Extract Restaurant Name
    const pageTitle = await page.title();
    const restaurantName = pageTitle.split(',')[0].replace(' order online', '') || "Zomato Restaurant";
    const restaurantSlug = restaurantUrl.split("/").filter(Boolean).pop() || Date.now().toString();

    console.log(`🏢 [Zomato Scraper] Found Restaurant: ${restaurantName}`);

    const restaurant = await prisma.restaurant.upsert({
      where: { slug: restaurantSlug },
      update: { name: restaurantName, url: restaurantUrl },
      create: {
        name: restaurantName,
        slug: restaurantSlug,
        url: restaurantUrl,
        source: "zomato"
      }
    });

    // 4. Scrape Menu Items via JSON State [NEW: 2026 Gold Standard - Hyper-Recursive]
    emitUpdate('scraper:log', { message: `🧪 [PUPPETEER] EXTRACTING DEEP JSON STATE...`, status: 'primary' });
    const jsonData = await page.evaluate(() => {
        try {
            // @ts-ignore
            const state = window.__PRELOADED_STATE__;
            if (!state) return null;
            
            const results: any[] = [];
            const resId = state.pages?.current?.resId;
            if (!resId) return null;

            const restaurantData = state.pages?.restaurant?.[resId];
            if (!restaurantData) return null;

            const menuList = restaurantData.order?.menuList;
            if (!menuList) return null;

            // Zomato might have categories directly or nested in multiple menus
            const allMenus = menuList.menus || [];
            
            allMenus.forEach((menuWrapper: any) => {
                const menu = menuWrapper.menu;
                if (!menu) return;

                const categories = menu.categories || [];
                categories.forEach((catWrapper: any) => {
                    const category = catWrapper.category;
                    if (!category) return;

                    const categoryName = category.name || "General";
                    const items = category.items || [];
                    
                    items.forEach((itemWrapper: any) => {
                        const i = itemWrapper.item;
                        if (!i || !i.name) return;

                        // Price handling: variants -> default_price -> price
                        const price = i.price || (i.variants?.[0]?.price) || 0;
                        results.push({
                            name: i.name,
                            price: parseFloat(price) || 0,
                            description: i.desc || "",
                            category: categoryName,
                            imageUrl: i.item_image_url || i.image_url || null
                        });
                    });
                });
            });

            // Fallback for some structures that use 'sections' flat
            if (results.length === 0) {
              const sections = menuList.menu_sections || [];
              sections.forEach((section: any) => {
                const sectionName = section.title || "General";
                const menuItems = section.menu_items || [];
                menuItems.forEach((item: any) => {
                  const i = item.item;
                  if (!i || !i.name) return;
                  results.push({
                      name: i.name,
                      price: parseFloat(i.price) || 0,
                      description: i.desc || "",
                      category: sectionName,
                      imageUrl: i.item_image_url || null
                  });
                });
              });
            }

            return results;
        } catch(e) { return null; }
    });

    let items = jsonData;
    if (items && items.length > 0) {
        emitUpdate('scraper:log', { message: `✅ [JSON_DEEP] EXTRACTED ${items.length} ITEMS DIRECTLY!`, status: 'success' });
    } else {
        emitUpdate('scraper:log', { message: `⚠️ [JSON_DEEP] FAILED. FALLING BACK TO DOM...`, status: 'primary' });
        // Old DOM fallback (keeping for safety)
        items = await page.evaluate(() => {
            const results: any[] = [];
            const h4s = Array.from(document.querySelectorAll('h4'));
            h4s.forEach(h4 => {
                const name = h4.innerText?.trim();
                const parent = h4.closest('div');
                if (name && parent) {
                  const pEl = Array.from(parent.parentElement?.querySelectorAll('span, div') || []).find(el => (el as HTMLElement).innerText?.includes('₹'));
                  const pStr = (pEl as HTMLElement)?.innerText || "0";
                  const p = parseFloat(pStr.replace(/[^\d.]/g, '')) || 0;
                  results.push({ name, price: p, description: "", category: "Scraped", imageUrl: null });
                }
            });
            return results;
        });
    }

    console.log(`🥡 [Zomato Scraper] Found ${items.length} items. Syncing to DB...`);

    // 5. Save items & Upload Zomato Images to Cloudinary
    const { uploadImageFromUrl } = await import("../lib/uploader.js");
    let itemsCount = 0;

    for (const item of items) {
      if (!item.name || item.name.length < 2) continue;

      let finalImageUrl = null;
      if (item.imageUrl) {
        try {
          // Store Zomato's image permanently on Cloudinary
          finalImageUrl = await uploadImageFromUrl(item.imageUrl, item.name);
          console.log(`📸 [${item.name}] Image Sync: Direct from Zomato URL: ${item.imageUrl.slice(0, 50)}...`);
        } catch (e) {
          console.warn(`⚠️ [${item.name}] Zomato image upload failed. Fallback to pending.`);
        }
      }

      await (prisma as any).menuItem.upsert({
        where: { name_restaurantId: { name: item.name, restaurantId: restaurant.id } },
        update: {
          price: item.price,
          description: item.description || "",
          category: item.category || "General",
          image: finalImageUrl || undefined,
          status: finalImageUrl ? "completed" : "pending"
        },
        create: {
          name: item.name,
          price: item.price,
          description: item.description || "",
          category: item.category || "General",
          source: "zomato",
          restaurantId: restaurant.id,
          image: finalImageUrl,
          status: finalImageUrl ? "completed" : "pending"
        }
      });
      itemsCount++;
    }

    await browser.close();
    console.log(`✅ [Zomato Scraper] Sync complete. ${itemsCount} items saved.`);
    return { restaurant, itemsCount };

  } catch (error: any) {
    console.error("❌ [Zomato Scraper] Error:", error.message);
    if (browser) await browser.close();
    throw error;
  }
}
