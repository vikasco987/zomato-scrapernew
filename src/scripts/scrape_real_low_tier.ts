import puppeteerMock from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const puppeteer = puppeteerMock as any;
puppeteer.use(StealthPlugin());

const prisma = new PrismaClient();

async function run() {
    console.log("🚀 Starting Targeted Scraper for REAL less-famous & low-rating restaurants...");
    
    const browser = await puppeteer.launch({
        headless: false, // Run headful so we can bypass any checks easily
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,800'
        ],
        defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();
    
    // We will search in Narela and Najafgarh (Outer Delhi outskirts)
    // Sorted by cost low to high to get small dhabas, street food, and less-famous outlets
    const targets = [
        { name: 'Narela', url: 'https://www.zomato.com/ncr/narela-restaurants?sort=cost_asc' },
        { name: 'Najafgarh', url: 'https://www.zomato.com/ncr/najafgarh-restaurants?sort=cost_asc' }
    ];

    const allLeads = [];

    for (const target of targets) {
        console.log(`🌍 Navigating to ${target.name} outlets: ${target.url}`);
        try {
            await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 60000 });
            
            // Scroll down to load more small dhabas/outlets
            for (let i = 0; i < 6; i++) {
                await page.evaluate(() => window.scrollBy(0, 1000));
                await new Promise(r => setTimeout(r, 2000));
            }

            // Extract restaurant URLs
            const links = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a'));
                return anchors
                    .map(a => a.href)
                    .filter(href => href.includes('/order') || href.includes('/info'))
                    .map(href => href.split('/order')[0].split('/info')[0])
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .slice(0, 20); // Get top 20 low-cost ones per area
            });

            console.log(`📌 Discovered ${links.length} potential low-tier outlets in ${target.name}`);

            for (const link of links) {
                try {
                    console.log(`🔍 Inspecting details: ${link}`);
                    await page.goto(link + '/info', { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 2500));

                    // Get Preloaded state if available
                    const data = await page.evaluate(() => {
                        const state = (window as any).__PRELOADED_STATE__;
                        if (!state?.pages?.restaurant) return null;
                        const resId = Object.keys(state.pages.restaurant)[0];
                        const resto = state.pages.restaurant[resId];
                        return {
                            name: resto.name,
                            rating: parseFloat(resto.rating?.aggregate_rating || "0"),
                            photos: parseInt(resto.photos?.count || "0"),
                            address: resto.sections?.SECTION_RES_CONTACT?.res_info?.address || "Unknown Address",
                            phone: resto.sections?.SECTION_RES_CONTACT?.res_info?.phoneDetails?.phoneStr || ""
                        };
                    });

                    if (data) {
                        // Apply Smart Low-Tier Heuristics
                        // 1. Rating should be low/medium (< 3.9) OR 0 (unrated / new outlet)
                        // 2. Photos should be minimal (< 10 photos - unbranded/less famous)
                        const isLowTier = (data.rating === 0 || data.rating < 3.9) && data.photos < 12;
                        
                        if (isLowTier && data.phone) {
                            console.log(`🎯 MATCH FOUND: ${data.name} | Rating: ${data.rating} | Photos: ${data.photos} | Phone: ${data.phone}`);
                            allLeads.push({
                                name: data.name,
                                phone: data.phone,
                                address: data.address,
                                rating: data.rating,
                                photos: data.photos,
                                url: link,
                                location: target.name
                            });
                        } else {
                            console.log(`⏩ SKIPPED (Famous/High rating): ${data.name} (Rating: ${data.rating}, Photos: ${data.photos})`);
                        }
                    } else {
                        // Fallback DOM extraction if Preloaded State is blocked
                        const domData = await page.evaluate(() => {
                            const nameEl = document.querySelector('h1');
                            const name = nameEl ? nameEl.innerText.trim() : 'Unknown';
                            
                            // Extract ratings
                            const ratingEl = document.querySelector('[class*="rating"]');
                            const rating = ratingEl ? parseFloat(ratingEl.textContent || "0") : 0;
                            
                            // Find phone number strings
                            const allTexts = Array.from(document.querySelectorAll('p, span, div')).map(el => (el as HTMLElement).innerText);
                            const phoneRegex = /(?:\+91|0)?[ -]?\d{4,5}[ -]?\d{5,6}/g;
                            let phones = [];
                            for (const t of allTexts) {
                                if (t && t.match(phoneRegex)) phones.push(...t.match(phoneRegex)!);
                            }
                            const phone = [...new Set(phones)].filter(p => p.length >= 10)[0] || "";

                            return { name, rating, phone, address: "Delhi NCR", photos: 0 };
                        });

                        if (domData.phone && (domData.rating === 0 || domData.rating < 3.9)) {
                            console.log(`🎯 DOM MATCH FOUND: ${domData.name} | Rating: ${domData.rating} | Phone: ${domData.phone}`);
                            allLeads.push({
                                name: domData.name,
                                phone: domData.phone,
                                address: domData.address,
                                rating: domData.rating,
                                photos: 0,
                                url: link,
                                location: target.name
                            });
                        }
                    }

                } catch (err: any) {
                    console.log(`❌ Error checking restaurant: ${err.message}`);
                }
            }

        } catch (err: any) {
            console.log(`❌ Error in ${target.name} fetch: ${err.message}`);
        }
    }

    await browser.close();

    console.log(`\n✅ Scrape Completed! Found ${allLeads.length} genuine low-tier leads.`);
    fs.writeFileSync('real_low_tier_leads.json', JSON.stringify(allLeads, null, 2));

    if (allLeads.length > 0) {
        console.log("💾 Importing leads into Database...");
        const session = await prisma.scrapingSession.create({
            data: {
                location: 'Narela & Najafgarh (Low-Tier)',
                source: 'ZOMATO-LOW-TIER',
                status: 'completed'
            }
        });

        for (const lead of allLeads) {
            await prisma.restaurantLead.create({
                data: {
                    name: lead.name,
                    phone: lead.phone,
                    url: lead.url,
                    email: 'N/A',
                    address: lead.address,
                    source: 'Zomato Low-Tier Engine',
                    location: lead.location,
                    confidence: lead.rating === 0 ? 95 : 85, // Higher confidence if unrated (very ideal client)
                    sessionId: session.id
                }
            });
        }
        console.log("🎉 Successfully imported all genuine low-tier leads into the database!");
    } else {
        console.log("⚠️ No low-tier leads found to import.");
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
