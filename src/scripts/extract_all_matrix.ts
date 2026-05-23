import fs from 'fs';
import XLSX from 'xlsx';

const files = [
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (8).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-06.xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-06 (2).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-06 (3).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-06 (4).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-06 (5).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14.xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (1).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (2).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (3).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (4).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (5).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (6).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (7).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (9).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (10).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (11).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (12).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (13).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (14).xlsx',
    '/Users/vikas/Downloads/Matrix_Export_Marketing leads_2026-04-14 (15).xlsx'
];

const uniquePhonesMap = new Map<string, string>();

for (const file of files) {
    if (fs.existsSync(file)) {
        try {
            const workbook = XLSX.readFile(file);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);
            for (const row of data as any[]) {
                let phone = row['Phone number'] || row['Phone Number'] || '';
                phone = phone.toString().trim();
                // Clean the phone number to 10 digits
                const digits = phone.replace(/[^0-9]/g, '');
                const cleanPhone = digits.length >= 10 ? digits.slice(-10) : '';
                if (cleanPhone && cleanPhone.startsWith('9') || cleanPhone.startsWith('8') || cleanPhone.startsWith('7')) {
                    const formattedPhone = `+91${cleanPhone}`;
                    if (!uniquePhonesMap.has(formattedPhone)) {
                        // Gather details if available or set default
                        uniquePhonesMap.set(formattedPhone, file);
                    }
                }
            }
        } catch (e) {}
    }
}

console.log(`🎯 Total Unique Real Indian Mobile Numbers extracted from Matrix Leads: ${uniquePhonesMap.size}`);

const list = Array.from(uniquePhonesMap.keys());
console.log(`🔍 Sample 5 extracted numbers:`, list.slice(0, 5));
