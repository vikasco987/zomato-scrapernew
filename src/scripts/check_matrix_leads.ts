import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const downloadsDir = '/Users/vikas/Downloads';
const files = fs.readdirSync(downloadsDir).filter(f => f.startsWith('Matrix_Export_Marketing leads') && f.endsWith('.xlsx'));

console.log(`🔍 Found ${files.length} Matrix Export files in Downloads.`);

let totalLeads = 0;
for (const file of files) {
    const fullPath = path.join(downloadsDir, file);
    try {
        const workbook = XLSX.readFile(fullPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        totalLeads += data.length;
        console.log(`📁 File: ${file} | Rows: ${data.length}`);
        if (data.length > 0) {
            console.log(`   Sample Row:`, JSON.stringify(data[0], null, 2));
        }
    } catch (e: any) {
        console.log(`   ❌ Error reading ${file}: ${e.message}`);
    }
}

console.log(`\n🎉 Total potential real leads across all Matrix files: ${totalLeads}`);
