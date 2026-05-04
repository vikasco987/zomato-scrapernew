import { cleanDishName } from "../scraper/utils.js";

/**
 * 🧠 AI SCORING LOGIC
 * Evaluates image candidates based on production heuristics.
 */
export function scoreImage(img: { url: string; width?: number; height?: number }, dishName: string) {
  let score = 0;
  const url = img.url.toLowerCase();
  
  // Clean name: "Veg fried momos ( full )" -> "veg fried momos"
  const cleanName = cleanDishName(dishName).toLowerCase();
  const keywords = cleanName.split(/\s+/).filter(k => k.length > 2);

  // 1. Keyword Density Match (+10 per word - INCREASED WEIGHT)
  const matches = keywords.filter(k => url.includes(k)).length;
  score += matches * 10;

  // 2. Technical Dimension Check (+3 for HD)
  if (img.width && img.width > 400) score += 3;

  // 3. Domain Authority (+4 for trusted food/beverage domains)
  const trustedDomains = [
    "pinimg", "hebbarskitchen", "vegrecipesofindia", "zmtcdn", 
    "swiggy", "foodviva", "indianhealthyrecipes", "cocacola", "pepsico",
    "fanta", "nespresso", "starbucks"
  ];
  if (trustedDomains.some(domain => url.includes(domain))) {
    score += 4;
  }

  // 4. Reject Non-Food Noise (-25 for UI/Stock elements - INCREASED PENALTY)
  const noiseKeywords = ["logo", "icon", "banner", "placeholder", "default", "avatar", "stock", "alamy", "shutterstock", "dreamstime", "watermark", "text", "price", "label"];
  if (noiseKeywords.some(k => url.includes(k))) {
    score -= 25;
  }

  return score;
}

/**
 * 🥇 BEST PICKER
 */
export function pickBestImage(images: { url: string; width?: number; height?: number }[], dishName: string) {
  let best = null;
  let bestScore = -100; // Start low to allow for negative vetting

  for (const img of images) {
    const score = scoreImage(img, dishName);
    if (score > bestScore) {
      bestScore = score;
      best = img;
    }
  }

  return best;
}
