import fs from 'fs';
import XLSX from 'xlsx';

const files = [
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-06.xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (8).xlsx'
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
                console.log(`🔍 Sample:`, JSON.stringify(data.slice(0, 1), null, 2));
            }
        } catch (e: any) {
            console.log(`❌ Error reading: ${e.message}`);
        }
    } else {
        console.log(`⚠️ File not found: ${file}`);
    }
}
