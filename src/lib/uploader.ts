import cloudinary from "./cloudinary.js";

/**
 * 🔥 ULTIMATE PRO UPLOAD (URL TO CLOUD)
 * Upgrades to direct URL fetching with AI-powered auto-compression.
 * NO LOCAL DISK USAGE. ZERO SERVER CPU COST.
 */
export async function uploadImageFromUrl(imageUrl: string, dishName: string) {
  try {
    const sanitizedDish = dishName
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9-]/g, "")
      .toLowerCase();
      
    const publicId = `${sanitizedDish}-${Date.now()}`;

    console.log(`☁️ Cloudinary: Attempting Direct Fetch for ${dishName}...`);
    
    try {
      const result = await cloudinary.uploader.upload(imageUrl, {
        folder: "food-menu",
        public_id: publicId,
        overwrite: false,
        transformation: [
          { width: 500, crop: "limit" },
          { quality: "auto:eco" },
          { fetch_format: "auto" }
        ]
      });
      console.log(`✅ [${dishName}] Direct Cloud URL: ${result.secure_url}`);
      return result.secure_url;
    } catch (directErr: any) {
      console.warn(`⚠️ [${dishName}] Direct Fetch blocked. Switching to Buffer Sync...`);
      
      // 🔥 FALLBACK: Fetch to Local Buffer first (Bypasses most hotlink protections)
      const axios = (await import("axios")).default;
      const response = await axios.get(imageUrl, { 
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });

      const buffer = Buffer.from(response.data);
      const base64Image = `data:${response.headers['content-type']};base64,${buffer.toString('base64')}`;

      const result = await cloudinary.uploader.upload(base64Image, {
        folder: "food-menu",
        public_id: publicId,
        transformation: [
          { width: 500, crop: "limit" },
          { quality: "auto:eco" },
          { fetch_format: "auto" }
        ]
      });

      console.log(`✅ [${dishName}] Buffer Sync Success: ${result.secure_url}`);
      return result.secure_url;
    }
  } catch (err: any) {
    console.error(`❌ [${dishName}] Total Upload Failure:`, err.message);
    return null;
  }
}
