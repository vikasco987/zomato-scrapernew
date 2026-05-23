import XLSX from 'xlsx';
import fs from 'fs';

const files = [
    '/Users/vikas/.gemini/antigravity/scratch/Magicscale_Responses_Export.xlsx',
    '/Users/vikas/.gemini/antigravity/scratch/Magicscale_Responses_Export_V2.xlsx'
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
                console.log(`🔍 Keys:`, Object.keys(data[0] as any).join(', '));
                console.log(`🔍 Sample:`, JSON.stringify(data.slice(0, 2), null, 2));
            }
        } catch (e: any) {
            console.log(`❌ Error reading: ${e.message}`);
        }
    }
}
