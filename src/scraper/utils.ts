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

const HINDI_TO_ENGLISH_MAP: Record<string, string> = {
    "मटर पनीर": "matar paneer",
    "चीज़ चिली": "chilli paneer",
    "कढ़ी": "kadhi pakora",
    "कढ़ी चावल": "kadhi chawal",
    "छोले चावल": "chole chawal",
    "राजमा चावल": "rajma chawal",
    "मैगी": "maggi noodles",
    "दाल तड़का": "dal tadka",
    "दाल मखनी": "dal makhani",
    "जीरा आलू": "jeera aloo",
    "ग्रेवी चाप": "gravy chaap",
    "चिली चाप": "chilli chaap",
    "शाही पनीर": "shahi paneer",
    "कढ़ाई पनीर": "kadai paneer",
    "पनीर मसाला टिक्का": "paneer tikka masala",
    "पनीर भुर्जी": "paneer bhurji",
    "चाय": "masala chai",
    "कॉफ़ी": "coffee",
    "लस्सी": "lassi",
    "तवा रोटी": "tawa roti",
    "बटर तवा रोटी": "butter tawa roti",
    "तंदूरी बटर रोटी": "tandoori butter roti",
    "सादा पराठा": "plain paratha",
    "लच्छा पराठा": "lachha paratha",
    "मिक्स स्टफ पराठा": "mix stuffed paratha",
    "रोटी": "roti",
    "नान": "naan",
    "पनीर": "paneer"
};

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
        .replace(/\bnon-veg\b/g, 'non veg')
        .replace(/\bchilly\b/g, 'chilli')
        .replace(/\bmutter\b/g, 'matar')
        .replace(/\bfry\b/g, 'fries');

    // 2. Remove trailing punctuation often found in menus (like trailing parens or dots)
    cleaned = cleaned.replace(/[.)\]\s]+$/, '').trim();

    // 3. Preserve sizes like 500ml, 1L, 250ml but remove generic text in parens
    const hasSize = /\d+\s*(ml|l|ltr|kg|gm|pcs)/i.test(cleaned);
    
    if (!hasSize) {
        // Robust cleaning: removes (R), (V), (Full), etc. individually
        cleaned = cleaned.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '');
    } else {
        cleaned = cleaned.replace(/[()\[\]]/g, ' ');
    }

    // 4. 🏆 ADVANCED VARIANT CLEANING (H/F/R, Half/Full, etc.)
    cleaned = cleaned.replace(/[-/]\s*[HFhfrR]\b|\b(half|full|quarter|small|large|medium|regular|raw|frozen)\b/gi, "");

    // 5. Devanagari translation mapper
    const hasHindi = /[\u0900-\u097F]/.test(cleaned);
    if (hasHindi) {
        for (const [hindi, english] of Object.entries(HINDI_TO_ENGLISH_MAP)) {
            if (cleaned.includes(hindi)) {
                cleaned = cleaned.replace(new RegExp(hindi, 'g'), english);
            }
        }
    }

    return cleaned
        .replace(/[^a-zA-Z0-9\s\u0900-\u097F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};
