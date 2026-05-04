import { scrapeFoodImages } from "./src/scraper/index.js";

async function test() {
    console.log("Testing Butter Toast...");
    const result = await scrapeFoodImages("Butter Toast");
    console.log("Result:", JSON.stringify(result, null, 2));
}

test().catch(console.error);
