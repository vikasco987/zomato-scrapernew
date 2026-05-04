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
    // Preserve sizes like 500ml, 1L, 250ml but remove generic text in parens
    let cleaned = name;
    
    // If it contains a size pattern, don't just strip everything in parens
    const hasSize = /\d+\s*(ml|l|ltr|kg|gm|pcs)/i.test(name);
    
    if (!hasSize) {
        cleaned = cleaned.replace(/\(.*\)/g, '').replace(/\[.*\]/g, '');
    } else {
        cleaned = cleaned.replace(/[()\[\]]/g, ' ');
    }

    // 🏆 ADVANCED VARIANT CLEANING (H/F/R, Half/Full, etc.)
    cleaned = cleaned.replace(/[-/]\s*[HFhfrR]\b|\b(half|full|quarter|small|large|medium|regular)\b/gi, "");

    return cleaned
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};
