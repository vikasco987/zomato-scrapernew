import axios from 'axios';
const EXTERNAL_BASE = "https://billing.kravy.in/api/external";
const SECRET_KEY = "kravy_scraper_secret_2026";

async function main() {
    const userId = "user_3D1R0whHFVLAcnT8cgnB4kDTnfR";
    const headers = { "x-scraper-secret": SECRET_KEY };
    const res = await axios.get(`${EXTERNAL_BASE}/menu/${userId}`, { headers });
    const items = res.data;
    
    console.log(`Total Items from Billing: ${Array.isArray(items) ? items.length : 'Object format'}`);
    
    const allItems = Array.isArray(items) ? items : [...(items.pending || []), ...(items.completed || [])];
    
    console.log('Sample Item Names:');
    allItems.slice(0, 50).forEach(i => console.log(`- ${i.name || i.foodName}`));
    
    const rVItems = allItems.filter(i => (i.name || "").includes("(R) (V)"));
    console.log(`\nItems with (R) (V): ${rVItems.length}`);
    rVItems.forEach(i => console.log(`  - ${i.name} (Image: ${i.imageUrl || 'NONE'})`));
}

main().catch(console.error);
