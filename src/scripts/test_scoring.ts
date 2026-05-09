import { scrapeFoodImages } from '../scraper/index.js';
import { scoreImage } from '../lib/scoring.js';

async function test() {
    const dish = "Paneer Manchurian";
    console.log(`Testing search and scoring for: ${dish}`);
    const result = await scrapeFoodImages(dish);
    
    if (result.success) {
        console.log(`Found ${result.candidates.length} candidates.`);
        result.candidates.forEach((c: any, i: number) => {
            const score = scoreImage(c, dish);
            console.log(`[${i}] Score: ${score} | URL: ${c.url.slice(0, 80)}...`);
        });
    } else {
        console.log("Search failed.");
    }
}

test().catch(console.error);
