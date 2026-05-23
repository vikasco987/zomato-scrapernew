import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const downloadsDir = '/Users/vikas/Downloads';
const files = fs.readdirSync(downloadsDir).filter(f => f.startsWith('Matrix_Export_Marketing leads') && f.endsWith('.xlsx'));

for (const file of files) {
    const fullPath = path.join(downloadsDir, file);
    try {
        const workbook = XLSX.readFile(fullPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        if (data.length > 0) {
            const firstRow: any = data[0];
            const keys = Object.keys(firstRow);
            console.log(`📄 File: ${file} | Keys: ${keys.join(', ')}`);
            // Check if any key has URL or Link or Restaurant or Name
            const hasUrl = keys.some(k => k.toLowerCase().includes('url') || k.toLowerCase().includes('link') || k.toLowerCase().includes('restaurant') || k.toLowerCase().includes('name') || k.toLowerCase().includes('outlet'));
            if (hasUrl) {
                console.log(`   🎯 MATCH! This file has restaurant details!`);
                console.log(`   Sample:`, JSON.stringify(data.slice(0, 3), null, 2));
            }
        }
    } catch (e: any) {
        // ignore
    }
}
