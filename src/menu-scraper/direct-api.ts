import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { uploadImageFromUrl } from "../lib/uploader.js";
import { emitUpdate } from "../lib/socket.js";

const prisma = new PrismaClient();

/**
 * 🚀 DIRECT API SCRAPER (USER REQUESTED METHOD)
 * Uses Zomato/Swiggy internal APIs
 */
export async function syncMenuDirect(url: string) {
  try {
    console.log(`📡 [Direct API Scraper] Syncing: ${url}`);

    // Normalize URL
    let targetUrl = url.split('?')[0];
    if (targetUrl.includes("zomato.com") && !targetUrl.endsWith('/order')) {
      targetUrl = targetUrl.replace(/\/$/, '') + '/order';
    }

    // Detect Source
    const isZomato = targetUrl.includes("zomato.com");
    const isSwiggy = targetUrl.includes("swiggy.com");

    let menuItems: any[] = [];
    let restaurantName = "New Restaurant";

    if (isZomato) {
      const response = await axios.get(
        "https://www.zomato.com/webroutes/getPage",
        {
          params: { page_url: targetUrl },
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "en-US,en;q=0.9",
          },
        }
      );
      const data = response.data;
      
      // DEBUG: Dump raw data to see structure
      const fs = await import('fs');
      fs.writeFileSync('./zomato_debug.json', JSON.stringify(data, null, 2));
      console.log("📂 [Debug] Zomato raw data dumped to zomato_debug.json");

      menuItems = extractZomatoMenu(data);
      restaurantName = data?.page_info?.pageTitle?.split(',')[0] || "Zomato Restaurant";
    } else if (isSwiggy) {
      console.log(`🦊 [Swiggy Sync] Using Browser Engine for Swiggy JSON fetch (Bypassing 403)...`);
      const swiggyId = targetUrl.split("-").pop() || "";
      const swiggyApiUrl = `https://www.swiggy.com/dapi/menu/v4/full?lat=28.6139&lng=77.2090&menuId=${swiggyId}`;
      
      const puppeteer = (await import('puppeteer-extra')).default;
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
      // @ts-ignore
      puppeteer.use(StealthPlugin());
      
      const browser = await (puppeteer as any).launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
      });
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
      
      await page.goto(swiggyApiUrl, { waitUntil: 'networkidle2' });
      const jsonContent = await page.evaluate(() => document.body.innerText);
      const data = JSON.parse(jsonContent);
      
      menuItems = extractSwiggyMenu(data);
      restaurantName = data?.data?.cards?.[0]?.card?.card?.info?.name || "Swiggy Restaurant";
      
      await browser.close();
    }

    console.log(`🥡 [Direct Sync] Parsed ${menuItems.length} items from ${isSwiggy ? 'Swiggy' : 'Zomato'}.`);

    const restaurantSlug = url.split("/").filter(Boolean).pop() || Date.now().toString();

    const existing = await (prisma as any).restaurant.findFirst({
      where: { slug: restaurantSlug }
    });

    let restaurant;
    if (existing) {
      restaurant = await (prisma as any).restaurant.update({
        where: { id: existing.id },
        data: { name: restaurantName, url: url }
      });
    } else {
      restaurant = await (prisma as any).restaurant.create({
        data: { 
          name: restaurantName, 
          slug: restaurantSlug, 
          url: url, 
          source: isSwiggy ? "swiggy" : "zomato"
        }
      });
    }

    const total = menuItems.length;

    // 🔴 LIVE EVENT: Sync Started
    emitUpdate('sync:start', { restaurantName, total, restaurantId: restaurant.id });

    let itemsCount = 0;
    for (const item of menuItems) {
      let finalImageUrl = null;
      if (item.image) {
        try {
          finalImageUrl = await uploadImageFromUrl(item.image, item.name);
        } catch (e) {}
      }

      await (prisma as any).menuItem.upsert({
        where: { name_restaurantId: { name: item.name, restaurantId: restaurant.id } },
        update: {
          price: item.price,
          category: item.category,
          description: item.description || '',
          image: finalImageUrl || undefined,
          status: finalImageUrl ? "completed" : "pending"
        },
        create: {
          name: item.name,
          price: item.price,
          category: item.category,
          description: item.description || '',
          source: isSwiggy ? "swiggy" : "zomato",
          restaurantId: restaurant.id,
          image: finalImageUrl,
          status: finalImageUrl ? "completed" : "pending"
        },
      });
      itemsCount++;

      // 🟢 LIVE EVENT: Item Saved
      emitUpdate('sync:item', {
        name: item.name,
        category: item.category,
        price: item.price,
        image: finalImageUrl,
        current: itemsCount,
        total,
        percent: Math.round((itemsCount / total) * 100)
      });
    }

    // 🏁 LIVE EVENT: Sync Complete
    emitUpdate('sync:done', { restaurantName, itemsCount, restaurantId: restaurant.id });

    return { success: true, restaurant, itemsCount };

  } catch (err: any) {
    console.error(`❌ [Direct API Scraper] Failed: ${err.message}`);
    throw err;
  }
}

/**
 * Zomato Extraction
 */
function extractZomatoMenu(data: any) {
  const items: any[] = [];
  try {
    console.log("🔍 [Direct API] Analyzing Zomato Response Structure...");
    
    // === BUILD PRICE + DESC LOOKUP FROM modifierGroups ===
    // Zomato stores actual prices in modifierGroups, NOT in main menu items
    const priceMap: Record<string, { price: number; desc: string }> = {};
    const modGroups = data?.page_data?.order?.menuList?.modifierGroups || {};
    Object.values(modGroups).forEach((mg: any) => {
      const groupItems = mg?.group?.items || [];
      groupItems.forEach((entry: any) => {
        const it = entry?.item;
        if (it?.name) {
          const key = it.name.toLowerCase().trim();
          const price = typeof it.price === 'number' ? it.price : 
                        typeof it.min_price === 'number' ? it.min_price : 0;
          // Only save if price > 0 (don't overwrite with 0)
          if (!priceMap[key] || price > 0) {
            priceMap[key] = { price, desc: it.desc || '' };
          }
        }
      });
    });
    console.log(`💰 [Direct API] Price map built: ${Object.keys(priceMap).length} items with prices`);

    // === FIND MENU ARRAYS ===
    const possibleMenus: any[] = 
      data?.page_data?.order?.menuList?.menus || 
      data?.page_data?.sections?.SECTION_MENU_FULL?.menus ||
      data?.page_data?.sections?.SECTION_MENU?.menus ||
      [];

    if (possibleMenus.length === 0) {
      const rawSections = data?.page_data?.sections || {};
      Object.values(rawSections).forEach((section: any) => {
        if (section.menus) possibleMenus.push(...section.menus);
      });
    }

    possibleMenus.forEach((menu: any) => {
      // The section title (e.g. "Grilled Chicken", "Burgers") is in menu.menu.name
      const sectionName = menu.menu?.name || menu.name || '';
      const categories = menu.categories || menu.menu?.categories || menu.category || [];
      
      categories.forEach((catWrapper: any) => {
        const category = catWrapper.category || catWrapper;
        const subCatName = category.name || '';
        // Use section name first, then sub-category, then General
        const categoryName = sectionName || subCatName || 'General';
        const menuItems = category.items || catWrapper.items || [];

        menuItems.forEach((entry: any) => {
          const item = entry.item || entry;
          if (item?.name) {
            // PRICE: check item first, then priceMap fallback
            let price = 0;
            const p = item.price;
            if (p && typeof p === 'number' && p > 0) {
              price = p;
            } else if (p && typeof p === 'object' && p.value > 0) {
              price = p.value / 100;
            }

            const lookup = priceMap[item.name.toLowerCase().trim()];
            if (price === 0 && lookup?.price > 0) {
              price = lookup.price;
            }

            // DESCRIPTION
            const description = item.desc || item.description || lookup?.desc || '';

            // IMAGE — prefer item_image_url, then media[0].image.url (strip query params)
            const rawImg = item.item_image_url || item.image_url ||
              (item.media?.[0]?.image?.url ? item.media[0].image.url.split('?')[0] : null);
            const imageUrl = rawImg && rawImg.length > 5 ? rawImg : null;

            items.push({ name: item.name, price, category: categoryName, description, image: imageUrl });
          }
        });
      });
    });

    console.log(`✅ [Direct API] Extracted ${items.length} items`);
    if (items.length === 0) console.log("❌ [Direct API] All paths exhausted. Items still 0.");

  } catch (e: any) {
    console.log("❌ [Direct API] Parsing error:", e.message);
  }
  return items;
}

/**
 * Swiggy Extraction
 */
function extractSwiggyMenu(data: any) {
  const items: any[] = [];
  try {
    // Swiggy JSON path for menu items
    const groupedCard = data?.data?.cards?.find((c: any) => c.groupedCard)?.groupedCard;
    const regularCards = groupedCard?.cardGroupMap?.REGULAR?.cards || [];
    
    regularCards.forEach((c: any) => {
      const itemCards = c?.card?.card?.itemCards || [];
      const catName = c?.card?.card?.title || "General";
      
      itemCards.forEach((ic: any) => {
        const info = ic?.card?.info;
        if (info && info.name) {
          items.push({
            name: info.name,
            price: (info.price || info.defaultPrice) / 100,
            category: catName,
            image: info.imageId ? `https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_300,h_300,c_fit/${info.imageId}` : null
          });
        }
      });
    });
  } catch (e) {}
  return items;
}
