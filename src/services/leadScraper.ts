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
  
  emitUpdate('lead_status', { message: `🚀 Engine Mega Scrape v4.6 Active for ${location}...` });

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
      
      const localities = ['gurgaon', 'noida', 'saket', 'connaught-place', 'hauz-khas', 'greater-kailash', 'vasant-kunj', 'dwarka', 'laxmi-nagar', 'karol-bagh', 'punjabi-bagh', 'rajouri-garden', 'rohini', 'pitampura', 'janakpuri', 'nehru-place', 'okhla', 'cyber-hub', 'golf-course-road', 'indirapuram'];
      
      const maxLeads = 15000;
      const rawLinks = new Set<string>();
      const queue: string[] = [];
      let discoveryActive = true;
      let processedTotal = 0;
      
      const userAgents = Array(5).fill(0).map(() => randomUseragent.getRandom());

      // 🚀 WORKER TASKS (START IMMEDIATELY)
      const workerTasks = Array(5).fill(0).map(async (_, index) => {
          const page = await browser.newPage();
          const ua = userAgents[index % userAgents.length];
          await page.setUserAgent(ua);
          
          let processedInSession = 0;

          while (discoveryActive || queue.length > 0) {
              const link = queue.shift();
              if (!link) {
                  await delay(3000, 5000); 
                  continue;
              }

              try {
                  console.log(`[W-${index}] Harvesting: ${link}`);
                  // 🛡️ WAIT AND SETTLE STRATEGY (V5.0)
                  await page.goto(link, { waitUntil: 'networkidle2', timeout: 75000 }).catch(() => null);
                  await delay(8000, 12000); 
                  
                  if (page.isClosed()) continue;

                  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
                  await delay(4000, 8000); 
                  
                  if (page.isClosed()) continue;

                  let name = "Unknown";
                  let phone = "Extraction Failed";
                  let confidence = 0;
                  let address = `${location} Region`;

                  // 🔄 EXTRACTION RETRY LOOP
                  for (let attempt = 0; attempt < 2; attempt++) {
                      try {
                          name = await page.$eval("h1", (el: any) => el.innerText).catch(() => 'Unknown');
                          if (name === 'Unknown') {
                              await delay(2000, 4000);
                              continue;
                          }

                          // 🚀 BROWSER-NATIVE EXTRACTION (V4.6)
                          const pageState = await page.evaluate(() => (window as any).__PRELOADED_STATE__);
                          
                          if (pageState?.pages?.restaurant) {
                              const resId = Object.keys(pageState.pages.restaurant)[0];
                              const restaurantData = resId ? pageState.pages.restaurant[resId] : null;
                              
                              if (restaurantData && restaurantData.sections) {
                                  const contactSec = Object.values(restaurantData.sections).find((s: any) => s.type === 'SECTION_RES_CONTACT') as any;
                                  
                                  // 🔍 DUAL-TRACK STATE EXTRACTION (V4.6)
                                  if (contactSec) {
                                      const phoneStr = contactSec.phoneData?.phoneNumber || contactSec.phoneDetails?.phoneStr;
                                      if (phoneStr) {
                                          phone = phoneStr;
                                          confidence = 98;
                                          address = contactSec.res_info?.address || contactSec.resInfo?.address || address;
                                      } else {
                                          console.log(`[W-${index}] Phone fields missing in state for: ${name}`);
                                      }
                                  } else {
                                      console.log(`[W-${index}] Contact section missing in state for: ${name}`);
                                  }
                              } else {
                                  console.log(`[W-${index}] Page is NOT a restaurant (Missing state.pages.restaurant) for: ${link}`);
                              }
                          }

                          // 🛡️ DOM FALLBACK (STRICT VERIFICATION)
                          if (phone === "Extraction Failed") {
                              const domPhone = await page.evaluate(() => {
                                  const telLink = document.querySelector('a[href^="tel:"]');
                                  return telLink ? telLink.getAttribute('href')?.replace('tel:', '') : null;
                              });
                              if (domPhone) {
                                  phone = domPhone;
                                  confidence = 90;
                              }
                          }

                          if (phone !== "Extraction Failed") {
                              break;
                          }

                          // Fallback to Click
                          const callClicked = await humanClick(page, 'button, div[role="button"]');
                          if (callClicked) {
                              await delay(3000, 5000);
                              const discoveredPhone = await page.evaluate(() => {
                                  const tel = document.querySelector('a[href^="tel:"]');
                                  return tel ? tel.textContent?.trim() : null;
                              });
                              if (discoveredPhone) { phone = discoveredPhone; confidence = 92; break; }
                          }
                      } catch (e: any) {
                          console.error(`[W-${index}] Extraction hitch: ${e.message}`);
                          await delay(2000, 4000);
                      }
                  }

                  if (phone && phone.length >= 8 && !phone.includes('Failed')) {
                    if (!processedPhones.has(phone)) {
                        processedPhones.add(phone);
                        const leadData = {
                            name, phone, email: "N/A",
                            address, source: 'Zomato v4.6',
                            location, url: link, confidence, sessionId
                        };
                        
                        try {
                            await (prisma as any).restaurantLead.create({ data: leadData });
                            leads.push(leadData);
                            processedTotal++;
                            
                            // Update Session Count
                            await (prisma as any).scrapingSession.update({
                                where: { id: sessionId },
                                data: { count: processedTotal }
                            });

                            console.log(`[LIVE EXTRACT] #${processedTotal} - ${name} | ${phone}`);
                            emitUpdate('lead_added', leadData);
                            emitUpdate('lead_status', { message: `✅ Extracted #${processedTotal}: ${name}` });
                        } catch (dbErr: any) {
                            if (dbErr.code === 'P2002') {
                                console.log(`[SKIPPED] Duplicate Phone: ${phone}`);
                            } else {
                                console.error(`[DB ERROR] ${dbErr.message}`);
                            }
                        }
                    }
                  }

                  processedInSession++;
                  if (processedInSession % 8 === 0) {
                      await page.goto('https://www.zomato.com', { waitUntil: 'domcontentloaded' }).catch(() => {});
                      await delay(8000, 15000);
                  }

              } catch (err: any) {
                  if (err.message.includes('Execution context was destroyed')) {
                      console.log(`[W-${index}] Context Reset - Skipping lead...`);
                  } else {
                      console.error(`[W-${index}] Error: ${err.message}`);
                  }
              }
          }
          await page.close().catch(() => {});
      });

      // 🔍 DISCOVERY ENGINE (FEEDS QUEUE)
      const mainPage = await browser.newPage();
      for (const loc of localities) {
          if (rawLinks.size >= maxLeads) break;
          
          const searchUrl = `https://www.zomato.com/ncr/restaurants/${loc}`;
          emitUpdate('lead_status', { message: `📍 Sub-Discovery: Exploring ${loc.toUpperCase()}...` });
          
          await mainPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
          await delay(3000, 5000);

          let scrollAttempts = 0;
          let lastHeight = 0;

          while (scrollAttempts < 40) {
              await mainPage.evaluate(() => window.scrollBy(0, 1000));
              await delay(2000, 3000);

                  const discovered = await mainPage.evaluate((slug: string) => {
                      const links: string[] = [];
                      const blacklisted = [
                        '/order','/info','/book','/reviews','/menu','/photos','/events',
                        '/restaurants/','/delivery/','/gold','/explore','/investor','/about','/careers',
                        '-restaurants', '/spots', '-bars', '-cafe', 'best-of', 'top-', 'great-',
                        'newly-opened', 'premium', 'trending', 'boxoffice', 'omakase', 'speakeasy', 
                        '?','&','=' 
                      ];
                      
                      document.querySelectorAll('a').forEach(el => {
                          try {
                              const href = el.href.toLowerCase();
                              if (!href.startsWith('http') || !href.includes(slug)) return;
                              
                              const url = new URL(href);
                              const pathParts = url.pathname.split('/').filter(Boolean);
                              
                              // Logic for valid restaurant stems (usually 2 or 3 parts depending on structure)
                              const isInfo = pathParts.length === 3 && pathParts[2] === 'info';
                              const isLead = (pathParts.length === 2 && pathParts[0] === slug) || 
                                           (pathParts.length === 3 && pathParts[0] === slug && pathParts[2] === 'info');

                              if (isLead) {
                                  const leaf = pathParts[1];
                                  const isCategory = blacklisted.some(p => leaf.includes(p.replace('/', '')));

                                  if (!isCategory) {
                                      const base = href.split('/info')[0];
                                      links.push(base + (base.endsWith('/') ? '' : '/') + 'info');
                                  }
                              }
                          } catch (e) {}
                      });
                      return [...new Set(links)];
                  }, locationSlug);

              let newFound = 0;
              discovered.forEach((link: string) => {
                  if (!rawLinks.has(link)) {
                      rawLinks.add(link);
                      queue.push(link);
                      newFound++;
                  }
              });

              if (newFound > 0) {
                  scrollAttempts = 0;
                  console.log(`[DISCOVERY] ${loc}: +${newFound} links. Total: ${rawLinks.size} | Queue: ${queue.length}`);
                  emitUpdate('lead_status', { message: `🔍 Mapping: ${rawLinks.size} leads discovered...` });
              } else {
                  scrollAttempts++;
              }

              const newHeight = await mainPage.evaluate(() => document.body.scrollHeight);
              if (newHeight === lastHeight) break;
              lastHeight = newHeight;
              if (rawLinks.size >= maxLeads) break;
          }
      }

      discoveryActive = false;
      await mainPage.close();
      await Promise.all(workerTasks);

      // ✅ FINALIZE SESSION
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
