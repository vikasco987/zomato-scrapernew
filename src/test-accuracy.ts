import { scrapeAndSaveFood } from "./index.js";

async function runAccuracyTest() {
  const challengeDishes = [
    "Butter Chicken",
    "Masala Dosa",
    "Cold Coffee with Ice Cream",
    "Burger with Fries",
    "Paneer Tikka"
  ];

  console.log("\n🧪 STARTING ACCURACY CHALLENGE (GOD-MODE ENGINE)...");

  for (const dish of challengeDishes) {
    console.log(`\n🚀 Processing: [${dish}]`);
    await scrapeAndSaveFood(dish);
    console.log(`✅ Finished: [${dish}]`);
  }

  console.log("\n🏁 ACCURACY CHALLENGE COMPLETE! Check Dashboard. 🥂");
  process.exit(0);
}

runAccuracyTest().catch(console.error);
