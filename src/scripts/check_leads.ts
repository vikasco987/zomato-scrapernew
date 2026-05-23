import XLSX from 'xlsx';
import fs from 'fs';

const files = [
    '/Users/vikas/Downloads/Delhi_Restaurants.xlsx',
    '/Users/vikas/Downloads/Delhi_Restaurants (1).xlsx',
    '/Users/vikas/Downloads/Texting leads.xlsx',
    '/Users/vikas/Downloads/Texting leads (2).xlsx',
    '/Users/vikas/Downloads/Texting leads (1).xlsx',
    '/Users/vikas/Downloads/Texting leads (3).xlsx'
];

for (const file of files) {
    if (fs.existsSync(file)) {
        console.log(`\n==========================================`);
        console.log(`📄 File: ${file}`);
        try {
            const workbook = XLSX.readFile(file);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);
            console.log(`📊 Number of rows: ${data.length}`);
            if (data.length > 0) {
                console.log(`🔍 Sample Row 1:`, JSON.stringify(data[0], null, 2));
            }
        } catch (e: any) {
            console.log(`❌ Error reading: ${e.message}`);
        }
    } else {
        console.log(`⚠️ File not found: ${file}`);
    }
}
