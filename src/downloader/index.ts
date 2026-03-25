import axios from "axios";
import fs from "fs";
import path from "path";

/**
 * Downloads an image from a URL and saves it locally.
 * Returns the absolute path to the saved image.
 */
export async function downloadImage(url: string, foodName: string): Promise<string> {
  const imagesDir = path.resolve(process.cwd(), "images");
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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    },
  });

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(filePath));
    writer.on("error", reject);
  });
}
