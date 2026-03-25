/**
 * 🧠 AI SCORING LOGIC
 * Evaluates image candidates based on production heuristics.
 */
export function scoreImage(img: { url: string; width?: number; height?: number }, dishName: string) {
  let score = 0;
  const url = img.url.toLowerCase();
  const keywords = dishName.toLowerCase().split(/\s+/);

  // 1. Keyword Density Match (+5 per word)
  const matches = keywords.filter(k => url.includes(k)).length;
  score += matches * 5;

  // 2. Technical Dimension Check (+3 for HD)
  if (img.width && img.width > 400) score += 3;

  // 3. Domain Authority (+4 for trusted food blogs/CDNs)
  const trustedDomains = [
    "pinimg", "hebbarskitchen", "vegrecipesofindia", "zmtcdn", 
    "swiggy", "foodviva", "indianhealthyrecipes"
  ];
  if (trustedDomains.some(domain => url.includes(domain))) {
    score += 4;
  }

  // 4. Reject Non-Food Noise (-15 for UI elements)
  const noiseKeywords = ["logo", "icon", "banner", "placeholder", "default", "avatar"];
  if (noiseKeywords.some(k => url.includes(k))) {
    score -= 15;
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
