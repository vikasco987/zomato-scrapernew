import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function scrapeCakeImage() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        const url = "https://www.zomato.com/ncr/theobroma-dlf-phase-4/order";
        console.log(`Navigating to ${url}...`);
        
        // Wait for items to load
        await page.waitForSelector('h4', { timeout: 30000 });
        
        // Scroll to reveal more items and images
        for(let i=0; i<3; i++) {
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 1000));
        }

        await page.screenshot({ path: 'zomato_menu_debug.png' });

        // Find items with images - more relaxed selectors
        const imageData = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('div')).filter(d => 
                d.innerText && d.innerText.toLowerCase().includes('cake') && 
                d.querySelector('img')
            );
            
            for (const item of items) {
                const img = item.querySelector('img');
                const text = item.innerText || "";
                const nameMatch = text.match(/([^\n]+Cake[^\n]*)/i);
                if (img && nameMatch) {
                    const src = img.getAttribute('src');
                    if (src && src.startsWith('http')) {
                        return {
                            name: nameMatch[1].trim(),
                            imageUrl: src
                        };
                    }
                }
            }
            return null;
        });

        if (imageData) {
            console.log(`\n✅ FOUND CAKE: ${imageData.name}`);
            console.log(`🖼️ IMAGE URL: ${imageData.imageUrl}`);
            fs.writeFileSync('cake_found.json', JSON.stringify(imageData, null, 2));
        } else {
            console.log("\n❌ No cake images found.");
        }

    } catch (err) {
        console.error("Error during scraping:", err);
    } finally {
        await browser.close();
    }
}

scrapeCakeImage();
