import fs from 'fs';

const filePath = '/Users/vikas/Downloads/myDB.RestaurantLead.json';
if (fs.existsSync(filePath)) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        console.log(`📊 Total rows in JSON: ${data.length}`);
        
        // Filter by location
        const locations = data.reduce((acc: Record<string, number>, curr: any) => {
            const loc = curr.location || 'Unknown';
            acc[loc] = (acc[loc] || 0) + 1;
            return acc;
        }, {});
        
        console.log(`📍 Locations:`, JSON.stringify(locations, null, 2));
        
        // Print sample Delhi row if it exists
        const delhiRow = data.find((d: any) => d.location && d.location.toLowerCase().includes('delhi'));
        if (delhiRow) {
            console.log(`🎯 Sample Delhi row:`, JSON.stringify(delhiRow, null, 2));
        }
    } catch (e: any) {
        console.log(`❌ Error: ${e.message}`);
    }
} else {
    console.log(`⚠️ File not found`);
}
