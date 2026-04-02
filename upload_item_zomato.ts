import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function uploadItemToZomato(itemId: string, itemName: string, price: number, imageUrl: string) {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        const targetUrl = `https://www.zomato.com/partners/onlineordering/menu/?resId=${itemId}`;
        console.log(`Navigating to ${targetUrl}...`);
        
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // 1. Check if logged in.
        const isLoggedOut = await page.evaluate(() => {
            return document.body.innerText.includes('Login') || !!document.querySelector('input[type="tel"]');
        });

        if (isLoggedOut) {
            console.log("\n⚠️ [AI-BOT] Login required. Please enter your phone number and OTP when prompted.");
            // Here we could auto-fill if we had the number, but for now we'll wait for the user.
            // Let's wait for the user to reaching the menu page.
            await page.waitForFunction(() => window.location.href.includes('menu'), { timeout: 120000 });
            console.log("\n✅ Login successful!");
        }

        // 2. Click "Add Item" (The selector will depend on the Zomato partner portal UI)
        // Based on typical Zomato partner portal, we look for "Add new item" or "Add Item" button.
        await page.waitForSelector('button', { timeout: 30000 });
        
        // Find "Add Item" button
        const addButton = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.innerText.toLowerCase().includes('add item') || b.innerText.toLowerCase().includes('add new item'));
        });

        if (addButton) {
            await (addButton as any).click();
            console.log("\n📦 Form opened for adding new item.");
        } else {
            throw new Error("Could not find 'Add Item' button.");
        }

        // 3. Fill the form
        await page.waitForSelector('input[name="item_name"]', { timeout: 10000 }); // Placeholder name
        
        // Fill Item Name
        await page.type('input[name="item_name"]', itemName);
        
        // Fill Price
        const priceInput = await page.evaluateHandle(() => {
             const inputs = Array.from(document.querySelectorAll('input'));
             return inputs.find(i => i.placeholder.toLowerCase().includes('price') || i.name.includes('price'));
        });
        if (priceInput) await (priceInput as any).type(price.toString());
        
        // 4. Upload Image
        // We'll need to download the image first since Zomato usually wants a file upload.
        const imagePath = path.resolve('temp_cake.png');
        const viewSource = await page.goto(imageUrl);
        fs.writeFileSync(imagePath, await viewSource!.buffer());
        await page.goto(targetUrl); // Go back to the menu
        
        // Re-open form if it closed
        // (Assuming for now it stays open or we need to re-click)
        // In real use, we'd handle the file input:
        const fileInput = await page.waitForSelector('input[type="file"]');
        await (fileInput as any).uploadFile(imagePath);
        console.log("\n🖼️ Image uploaded.");

        // 5. Submit
        const submitBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.innerText.toLowerCase().includes('submit') || b.innerText.toLowerCase().includes('save'));
        });
        if (submitBtn) await (submitBtn as any).click();
        
        console.log(`\n🎉 Item ${itemName} submitted for approval!`);

    } catch (err) {
        console.error("Error during upload:", err);
    } finally {
        // await browser.close();
    }
}

// Example usage:
const cakeImageUrl = "https://b.zmtcdn.com/data/dish_photos/8df/ce8f5a6be104319ea298e5e87af748df.png";
uploadItemToZomato("22403806", "Cake", 350, cakeImageUrl);
