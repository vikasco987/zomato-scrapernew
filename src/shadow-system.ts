import { prisma } from "./db/index.js";
import { emitUpdate } from "./lib/socket.js";

interface ShadowResult {
    name: string;
    status: 'approved' | 'rejected' | 'pending';
    score: number;
    reason?: string;
}

export async function runShadowTest(restaurantId: string) {
    console.log(`\n🕵️ STARTING SHADOW TEST FOR: ${restaurantId}`);
    
    const items = await (prisma as any).menuItem.findMany({
        where: { restaurantId },
        take: 10 // Pura menu nahi, sirf sampling ke liye
    });

    if (items.length === 0) throw new Error("No items found to test.");

    const results: ShadowResult[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const progress = Math.round(((i + 1) / items.length) * 100);

        // Update UI start
        console.log(`[${progress}%] Testing: ${item.name}...`);
        emitUpdate('shadow:item', { 
            name: item.name, 
            status: 'pending', 
            percent: progress 
        });

        // ... (simulation logic)
        const score = Math.floor(Math.random() * 40) + 60; // 60-100 range
        await new Promise(r => setTimeout(r, 1500)); 

        let status: 'approved' | 'rejected' = score > 75 ? 'approved' : 'rejected';
        const reason = status === 'rejected' ? 'Low Resolution / Non-Food Object' : undefined;

        results.push({ name: item.name, status, score, reason });
        console.log(`   └─ Result: ${status.toUpperCase()} (${score}%)`);

        // Update UI result
        emitUpdate('shadow:item', { 
            name: item.name, 
            status, 
            score, 
            reason, 
            percent: progress 
        });
    }

    return results;
}
