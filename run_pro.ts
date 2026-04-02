import { runSingleItemUploadBot } from './src/lib/zomato-bot.js';

const targetId = process.argv[2] || "22442158";
const itemName = process.argv[3] || "Cake";
const price = parseInt(process.argv[4]) || 350;

console.log(`\n🚀 INITIATING PRO-V2 UPLOAD: [${itemName}] → [${targetId}]`);

runSingleItemUploadBot(targetId, {
    name: itemName,
    price: price,
    description: "Special delicious dessert prepared by our master chefs. A must-try!"
}).then(() => {
    console.log("\n🏁 PRO-V2 DEPLOYMENT CYCLE FINISHED.");
}).catch(err => {
    console.error(`\n🚨 PRO-V2 CRITICAL FAILURE: ${err.message}`);
    process.exit(1);
});
