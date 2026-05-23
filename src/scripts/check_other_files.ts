import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const files = [
    '/Users/vikas/Downloads/Excel Ke Liye Leads Table.xlsx',
    '/Users/vikas/Downloads/Restaurant_Menu.xlsx',
    '/Users/vikas/Downloads/Updated_Restaurant_Menu_Modified.xlsx',
    '/Users/vikas/Downloads/restaurant_menu (1).xlsx'
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
