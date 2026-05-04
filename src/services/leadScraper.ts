import puppeteerMock from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { emitUpdate } from '../lib/socket.js';
import axios from 'axios';
// @ts-ignore
import randomUseragent from 'random-useragent';
import PQueue from 'p-queue';

const puppeteer = puppeteerMock as any;
puppeteer.use(StealthPlugin());

export interface RestaurantLead {
  name: string;
  outletName?: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  url?: string;
  location?: string;
  confidence: number;
}

const delay = (min: number, max: number) =>
  new Promise(res => setTimeout(res, Math.random() * (max - min) + min));

// 🛡️ HUMAN CLICK SIMULATOR (V4)
async function humanClick(page: any, selector: string) {
    try {
        const el = await page.$(selector);
        if (el) {
            const box = await el.boundingBox();
            if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                await delay(200, 500);
                await el.click();
                return true;
            }
        }
    } catch {}
    return false;
}

export async function scrapeLeads(location: string, source: string): Promise<RestaurantLead[]> {
  const leads: RestaurantLead[] = [];
  const processedPhones = new Set<string>();
  
  emitUpdate('lead_status', { message: `🚀 KRAVY SMART ENGINE v5.0 (Low-Tier Targeting) Active...` });

  const browser = await puppeteer.launch({
    headless: false, 
    defaultViewport: null,
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--start-maximized'
    ]
  });

  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    // 🕒 CREATE SCRAPING SESSION
    const session = await (prisma as any).scrapingSession.create({
        data: { location, source: source.toUpperCase(), status: 'processing' }
    });
    const sessionId = session.id;

    if (source === 'zomato') {
      let locationSlug = location.trim().replace(/\s+/g, '-').toLowerCase();
      if (locationSlug === 'delhi' || locationSlug === 'delhi-ncr') locationSlug = 'ncr';
      
      // ✅ TARGETING TIER 2 / OUTSKIRTS (Avoiding Prime Areas)
      const localities = [
        'uttam-nagar', 'najafgarh', 'laxmi-nagar', 'palam', 'sangam-vihar', 
        'vikaspuri', 'narela', 'badarpur', 'shahdara', 'seelampur',
        'nangloi', 'mundka', 'karawal-nagar', 'kondli', 'burari'
      ];
      
      // ✅ CATEGORY FOCUS
      const categories = ['street-food', 'tea', 'bakery', 'tiffin-services', 'snacks'];
      
      const maxLeads = 5000;
      const rawLinks = new Set<string>();
      const queue: string[] = [];
      let discoveryActive = true;
      let processedTotal = 0;
      
      const userAgents = Array(5).fill(0).map(() => randomUseragent.getRandom());

      // 🚀 WORKER TASKS
      const workerTasks = Array(3).fill(0).map(async (_, index) => {
          const page = await browser.newPage();
          await page.setUserAgent(userAgents[index % userAgents.length]);
          
          while (discoveryActive || queue.length > 0) {
              const link = queue.shift();
              if (!link) { await delay(2000, 4000); continue; }

              try {
                  await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null);
                  await delay(3000, 6000); 
                  
                  if (page.isClosed()) continue;

                  const pageState = await page.evaluate(() => (window as any).__PRELOADED_STATE__);
                  if (!pageState?.pages?.restaurant) continue;

                  const resId = Object.keys(pageState.pages.restaurant)[0];
                  const restaurantData = pageState.pages.restaurant[resId];
                  
                  if (!restaurantData) continue;

                  // 🧐 SMART FILTERING LOGIC
                  const rating = parseFloat(restaurantData.rating?.aggregate_rating || "0");
                  const photoCount = parseInt(restaurantData.photos?.count || "0");
                  const costForTwo = parseInt(restaurantData.sections?.SECTION_RES_CONTACT?.res_info?.cft?.text?.replace(/[^0-9]/g, '') || "999");

                  // ✅ REJECT HIGH-END / WELL-MAINTAINED
                  if (rating > 4.0) {
                    console.log(`⏩ [SKIPPED] High Rating (${rating}): ${restaurantData.name}`);
                    continue;
                  }
                  if (photoCount > 5) {
                    console.log(`⏩ [SKIPPED] Well Branded (${photoCount} photos): ${restaurantData.name}`);
                    continue;
                  }

                  let phone = "Extraction Failed";
                  let address = restaurantData.sections?.SECTION_RES_CONTACT?.res_info?.address || "Unknown";

                  const contactSec = Object.values(restaurantData.sections).find((s: any) => s.type === 'SECTION_RES_CONTACT') as any;
                  if (contactSec) {
                      phone = contactSec.phoneData?.phoneNumber || contactSec.phoneDetails?.phoneStr || "Extraction Failed";
                  }

                  if (phone !== "Extraction Failed" && !processedPhones.has(phone)) {
                    processedPhones.add(phone);
                    const leadData = {
                        name: restaurantData.name,
                        phone,
                        email: "N/A",
                        address,
                        source: 'Zomato SMART v5.0',
                        location: location,
                        url: link,
                        confidence: photoCount === 0 ? 100 : 85, // Higher confidence if no photos (Ideal client)
                        sessionId
                    };
                    
                    await (prisma as any).restaurantLead.create({ data: leadData });
                    leads.push(leadData);
                    processedTotal++;
                    
                    emitUpdate('lead_added', leadData);
                    emitUpdate('lead_status', { message: `🎯 Target Found #${processedTotal}: ${restaurantData.name} (Photos: ${photoCount})` });
                  }
              } catch (err: any) {
                  console.error(`[W-${index}] Error: ${err.message}`);
              }
          }
          await page.close().catch(() => {});
      });

      // 🔍 DISCOVERY ENGINE (With Filtering)
      const mainPage = await browser.newPage();
      for (const loc of localities) {
          for (const cat of categories) {
              // ✅ APPLYING COST LOW-TO-HIGH SORT VIA URL
              const searchUrl = `https://www.zomato.com/ncr/restaurants/${loc}/${cat}?sort=cost_asc`;
              emitUpdate('lead_status', { message: `📍 Scanning ${loc.toUpperCase()} for ${cat.toUpperCase()}...` });
              
              await mainPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
              await delay(2000, 4000);

              // Extract visible links (Simplified for speed)
              const discovered = await mainPage.evaluate(() => {
                  return Array.from(document.querySelectorAll('a'))
                    .map(a => a.href)
                    .filter(href => href.includes('/info'))
                    .filter(href => !href.includes('/order') && !href.includes('/menu'));
              });

              discovered.forEach((link: string) => {
                  if (!rawLinks.has(link)) {
                      rawLinks.add(link);
                      queue.push(link);
                  }
              });
              
              if (rawLinks.size >= maxLeads) break;
          }
          if (rawLinks.size >= maxLeads) break;
      }

      discoveryActive = false;
      await mainPage.close();
      await Promise.all(workerTasks);

      await (prisma as any).scrapingSession.update({
          where: { id: sessionId },
          data: { status: 'completed' }
      });
    }
  } catch (err: any) {
      emitUpdate('lead_status', { message: `❌ Error: ${err.message}` });
  } finally {
      await browser.close().catch(() => {});
  }

  return leads;
}
