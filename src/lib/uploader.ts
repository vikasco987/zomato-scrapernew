import cloudinary from "./cloudinary.js";

/**
 * 🔥 ULTIMATE PRO UPLOAD (URL TO CLOUD)
 * Upgrades to direct URL fetching with AI-powered auto-compression.
 * NO LOCAL DISK USAGE. ZERO SERVER CPU COST.
 */
export async function uploadImageFromUrl(imageUrl: string, dishName: string) {
  try {
    // 🔥 CRITICAL FIX: Strip invalid characters (&, (, ), etc.) for Cloudinary public_id
    const sanitizedDish = dishName
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9-]/g, "") // Allow alphanumeric and dashes
      .toLowerCase();
      
    const publicId = `${sanitizedDish}-${Date.now()}`;

    console.log(`☁️ Cloudinary: Direct Fetching ${dishName}...`);
    
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: "food-menu",
      public_id: publicId,
      overwrite: false, // Ensures we don't accidentally overwrite different items

      // 🔥 AUTO COMPRESSION + OPTIMIZATION (THE AI FLOW)
      transformation: [
        { width: 500, crop: "limit" }, // Resize to professional width
        { quality: "auto:eco" },       // AI Smart Compression (Maximum speed/size ratio)
        { fetch_format: "auto" }        // Serve as WebP/AVIF automatically based on browser support
      ]
    });

    console.log(`✅ [${dishName}] Cloud URL: ${result.secure_url}`);
    return result.secure_url;
  } catch (err: any) {
    if (err.message.includes("already exists")) {
       console.warn(`⚠️ Duplicate skipped: ${dishName}`);
       return null;
    }
    console.error(`❌ Cloud Upload failed (${dishName}):`, err.message);
    return null;
  }
}
