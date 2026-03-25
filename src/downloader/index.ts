import axios from "axios";
import fs from "fs";
import path from "path";

/**
 * Downloads an image and performs validation (size/type)
 */
export async function downloadImage(url: string, foodName: string): Promise<string> {
  const imagesDir = path.join(process.cwd(), "images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const fileName = `${foodName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.jpg`;
  const filePath = path.join(imagesDir, fileName);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    },
    timeout: 30000,
  });

  const contentType = response.headers["content-type"];
  if (!contentType || !contentType.startsWith("image/")) {
    throw new Error(`Invalid content type: ${contentType}. This is not an image.`);
  }

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", async () => {
        const stats = fs.statSync(filePath);
        // --- RELAXED SIZE VALIDATION ---
        // Some well-compressed food images can be around 3-4KB
        if (stats.size < 2500) { // 2.5KB (Absolute floor for icons/blank pixels)
            console.log(`❌ DISCARDED: Image too small (${stats.size} bytes) for ${foodName}`);
            fs.unlinkSync(filePath); 
            return reject(new Error("Image size suggests a thumbnail or icon (<2.5KB). Skipping..."));
        }
        resolve(filePath);
    });
    writer.on("error", (err) => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        reject(err);
    });
  });
}
