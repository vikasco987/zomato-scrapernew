import fs from 'fs';
import XLSX from 'xlsx';

const files = [
    '/Users/vikas/Downloads/kravy_leads_Delhi.csv',
    '/Users/vikas/Downloads/kravy_full_leads_export_2026-04-03.csv'
];

for (const file of files) {
    if (fs.existsSync(file)) {
        console.log(`\n==========================================`);
        console.log(`📄 File: ${file}`);
        try {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            console.log(`📊 Number of lines: ${lines.length}`);
            console.log(`🔍 Headers: ${lines[0]}`);
            console.log(`🔍 Sample Row 1: ${lines[1]}`);
            console.log(`🔍 Sample Row 2: ${lines[2]}`);
        } catch (e: any) {
            console.log(`❌ Error: ${e.message}`);
        }
    } else {
        console.log(`⚠️ File not found: ${file}`);
    }
}
