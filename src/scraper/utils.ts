export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const randomJitter = (min = 200, max = 800) => {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return delay(ms);
};

export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
];

export const getRandomUserAgent = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

/**
 * 🧹 CLEAN DISH NAME for SEARCH
 * Removes (full), (half), [V], etc to get pure food terms.
 */
export const cleanDishName = (name: string) => {
    // 1. Fix common typos and standardize search terms
    let cleaned = name.toLowerCase()
        .replace(/\bgauva\b/g, 'guava')
        .replace(/\bvanila\b/g, 'vanilla')
        .replace(/\bchoclate\b/g, 'chocolate')
        .replace(/\bchees\b/g, 'cheese')
        .replace(/\bcold coffee\b/g, 'iced coffee')
        .replace(/\bveg\.\b/g, 'veg')
        .replace(/\bnon-veg\b/g, 'non veg');

    // 2. Preserve sizes like 500ml, 1L, 250ml but remove generic text in parens
    const hasSize = /\d+\s*(ml|l|ltr|kg|gm|pcs)/i.test(cleaned);
    
    if (!hasSize) {
        // Robust cleaning: removes (R), (V), (Full), etc. individually
        cleaned = cleaned.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '');
    } else {
        cleaned = cleaned.replace(/[()\[\]]/g, ' ');
    }

    // 3. 🏆 ADVANCED VARIANT CLEANING (H/F/R, Half/Full, etc.)
    cleaned = cleaned.replace(/[-/]\s*[HFhfrR]\b|\b(half|full|quarter|small|large|medium|regular)\b/gi, "");

    return cleaned
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};
