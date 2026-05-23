import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const downloadsDir = '/Users/vikas/Downloads';
const files = fs.readdirSync(downloadsDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));

for (const file of files) {
    const fullPath = path.join(downloadsDir, file);
    try {
        if (file.endsWith('.xlsx')) {
            const workbook = XLSX.readFile(fullPath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);
            if (data.length > 50) {
                console.log(`📊 [XLSX] File: ${file} | Rows: ${data.length}`);
                console.log(`Keys:`, Object.keys(data[0] as any));
                console.log(`Sample:`, JSON.stringify(data[0], null, 2));
            }
        } else if (file.endsWith('.csv')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            if (lines.length > 50) {
                console.log(`📊 [CSV] File: ${file} | Rows: ${lines.length}`);
                console.log(`Header:`, lines[0]);
                console.log(`Sample:`, lines[1]);
            }
        }
    } catch (e: any) {
        // ignore errors
    }
}
