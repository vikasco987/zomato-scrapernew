import { scrapeZomatoMenu } from "./zomato.js";
import { scrapeSwiggyMenu } from "./swiggy.js";

export async function syncRestaurantMenu(url: string) {
  if (url.includes("zomato.com")) {
    return await scrapeZomatoMenu(url);
  } else if (url.includes("swiggy.com")) {
    return await scrapeSwiggyMenu(url);
  } else {
    throw new Error("❌ Unsupported URL! Please provide a valid Zomato or Swiggy restaurant link.");
  }
}
