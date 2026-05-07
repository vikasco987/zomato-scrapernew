import { scrapeFoodImages } from './src/scraper/index.js';

async function test() {
    const dish = "Gauva Juice";
    console.log(`Testing search for: ${dish}`);
    const result = await scrapeFoodImages(dish);
    console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
