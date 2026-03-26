import { scrapeAndSaveFood } from "./index.js";
import { prisma } from "./db/index.js";

async function runMasterTestSuite() {
  console.log("\n🧪 🔱 KRAVY AI MASTER AUTO-TEST SUITE INITIATED...");
  const startTime = Date.now();

  const testScenarios = [
    // 1. Combo Accuracy Test
    { name: "Cold Coffee with Ice Cream", category: "Combo" },
    { name: "Pizza with Extra Cheese", category: "Combo" },
    { name: "Burger with Fries", category: "Combo" },
    { name: "Paneer Tikka with Green Chutney", category: "Combo" },
    
    // 2. Edge Case & Drinks
    { name: "Coke", category: "Drink" },
    { name: "Plain Rice", category: "Simple" },
    { name: "Pasta with White Sauce", category: "Standard" },

    // 3. Failure Stability Test (Should NOT have images)
    { name: "Random Unknown Dish XYZ123", category: "Failure" },
    { name: "Test Food Dummy Object", category: "Failure" },

    // 4. Duplicate Handling
    { name: "Butter Chicken", category: "Duplicate" },
    { name: "Butter Chicken", category: "Duplicate" }
  ];

  console.log(`📊 SCENARIOS: ${testScenarios.length} | DEBUG_MODE: ON`);
  console.log("--------------------------------------------------");

  let successCount = 0;
  let failCount = 0;

  for (const scenario of testScenarios) {
    const itemStartTime = Date.now();
    console.log(`\n🔍 [${scenario.category}] Testing: ${scenario.name}...`);
    
    const result = await scrapeAndSaveFood(scenario.name);
    const duration = ((Date.now() - itemStartTime) / 1000).toFixed(2);

    if (scenario.category === "Failure") {
        if (!result || result.status === "failed") {
            console.log(`✅ SUCCESS: Correctly rejected junk dish. (${duration}s)`);
            successCount++;
        } else {
            console.error(`❌ FAILURE: Junk dish [${scenario.name}] actually got an image!`);
            failCount++;
        }
    } else {
        if (result && result.status === "completed") {
            console.log(`✅ SUCCESS: Image found & verified. (${duration}s)`);
            console.log(`🔗 CDN: ${result.cloudinaryUrl}`);
            successCount++;
        } else if (scenario.category === "Duplicate" && result === null) {
            console.log(`✅ SUCCESS: Correctly skipped duplicate item.`);
            successCount++;
        } else {
            console.warn(`⚠️ WARNING: No image found for valid dish [${scenario.name}].`);
        }
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  const totalMinutes = parseFloat(totalDuration);
  const avgSeconds = ((totalMinutes * 60) / testScenarios.length).toFixed(2);
  
  console.log("\n" + "=".repeat(50));
  console.log(`🏁 MASTER TEST COMPLETE in ${totalMinutes} minutes!`);
  console.log(`🏆 SUCCESSES: ${successCount}`);
  console.log(`❌ FAILURES: ${failCount}`);
  console.log(`⚡ AVG TIME: ${avgSeconds}s per item`);
  console.log("=".repeat(50));

  process.exit(0);
}

runMasterTestSuite().catch(console.error);
