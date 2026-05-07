import axios from 'axios';
const EXTERNAL_BASE = "https://billing.kravy.in/api/external";
const SECRET_KEY = "kravy_scraper_secret_2026";

async function main() {
    const userId = "user_3D1R0whHFVLAcnT8cgnB4kDTnfR";
    const headers = { "x-scraper-secret": SECRET_KEY };
    const res = await axios.get(`${EXTERNAL_BASE}/menu/${userId}`, { headers });
    const items = res.data;
    const allItems = Array.isArray(items) ? items : [...(items.pending || []), ...(items.completed || [])];
    
    console.log('--- Search Results ---');
    const searchTerms = ["Juice", "Shake", "Gauva", "Mango"];
    
    searchTerms.forEach(term => {
        const matches = allItems.filter(i => (i.name || i.foodName || "").toLowerCase().includes(term.toLowerCase()));
        console.log(`\nTerm: "${term}" -> Found ${matches.length} matches`);
        matches.forEach(i => console.log(`  - ${i.name || i.foodName} (Image: ${i.imageUrl ? 'YES' : 'NONE'})`));
    });
}

main().catch(console.error);
