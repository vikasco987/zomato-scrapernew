import fs from 'fs';
import XLSX from 'xlsx';

const file = '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (8).xlsx';

if (fs.existsSync(file)) {
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Total rows: ${data.length}`);
    
    // Find rows where Remark or other fields are not empty
    const nonEmptyRemark = data.filter((d: any) => d['[M] Remark'] && d['[M] Remark'].trim() !== '');
    console.log(`📝 Non-empty Remarks: ${nonEmptyRemark.length}`);
    for (let i = 0; i < Math.min(5, nonEmptyRemark.length); i++) {
        console.log(`👉 Row ${i}:`, JSON.stringify(nonEmptyRemark[i], null, 2));
    }
} else {
    console.log(`⚠️ File not found`);
}
