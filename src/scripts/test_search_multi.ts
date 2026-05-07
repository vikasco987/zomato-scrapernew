import { scrapeFoodImages } from '../scraper/index.js';

async function test() {
    const dishes = ["Mango Shake", "Gauva Juice", "Vanila Shake"];
    for (const dish of dishes) {
        console.log(`\n--- Testing: ${dish} ---`);
        const result = await scrapeFoodImages(dish);
        console.log(`Success: ${result.success}`);
        console.log(`Candidates: ${result.candidates.length}`);
        if (result.candidates.length > 0) {
            console.log(`First Candidate: ${result.candidates[0].url.slice(0, 50)}...`);
        }
    }
}

test().catch(console.error);
