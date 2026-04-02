import { runZomatoUploadBot } from './src/lib/zomato-bot.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 🚀 UNIFIED ZOMATO V2 RUNNER
 * This is the ultimate production-grade script for Zomato automation.
 * Usage: node --loader ts-node/esm start_upload_v2.ts [Source_Restaurant_ID] [Target_Zomato_ID]
 */

const sourceId = process.argv[2] || "user_36I5lxHihIHIpHURemGuQqelV9J"; // Fallback to provided source
const targetId = process.argv[3] || "22442158"; // Your target Zomato ID

console.log(`\n--- 👑 ZOMATO PRO-V2 AUTOMATION STARTING ---`);
console.log(`Source: ${sourceId}`);
console.log(`Target: ${targetId}`);
console.log(`-------------------------------------------\n`);

runZomatoUploadBot(sourceId, targetId)
    .then(() => {
        console.log("\n✅ ALL ASSETS DEPLOYED SUCCESSFULLY.");
        process.exit(0);
    })
    .catch(err => {
        console.error(`\n🚨 CRITICAL DEPLOYMENT FAILURE: ${err.message}`);
        process.exit(1);
    });
