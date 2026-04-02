import cron from "node-cron";
import { prisma } from "../db/index.js";
import { isUrlAlive } from "./image-validator.js";
import { emitUpdate } from "./socket.js";

export function calculateConfidence(item: any) {
    const uploadedAt = item.uploadedAt || item.createdAt;
    const hours = (Date.now() - new Date(uploadedAt).getTime()) / (1000 * 60 * 60);

    let score = 50;

    if (item.stabilityStatus === "LIVE") score += 20;
    if (item.stabilityStatus === "STABLE") score += 40;
    if (item.stabilityStatus === "REMOVED") score = 5;

    // Time bonus
    if (hours > 24) score += 10;
    if (hours > 48) score += 20;

    // Reliability penalty
    if (item.retries > 0) score -= (item.retries * 15);

    return Math.min(Math.max(score, 0), 99);
}

export function startStabilityTracker() {
    console.log("🕒 [Stability Engine v2.0] Active - Monitoring Lifecycle + Auto-Replace...");
    
    cron.schedule("*/10 * * * *", async () => {
        const items = await (prisma as any).menuItem.findMany({
            where: {
                image: { not: null },
                stabilityStatus: { in: ['PENDING', 'LIVE'] }
            },
            take: 20
        });

        for (const item of items) {
            const alive = await isUrlAlive(item.image);
            let newStatus = item.stabilityStatus;

            if (!alive) {
                newStatus = "REMOVED";
            } else {
                const uploadedAt = item.uploadedAt || item.createdAt;
                const hoursSinceUpload = (Date.now() - new Date(uploadedAt).getTime()) / (1000 * 60 * 60);

                if (hoursSinceUpload > 48) {
                    newStatus = "STABLE";
                } else {
                    newStatus = "LIVE";
                }
            }

            if (newStatus !== item.stabilityStatus) {
                const newHistoryEntry = {
                    status: newStatus,
                    time: new Date(),
                    note: newStatus === 'REMOVED' ? '🚨 Detection: Broken Link' : '🛡️ Check: Still Alive'
                };

                const currentHistory = Array.isArray(item.history) ? item.history : [];
                
                await (prisma as any).menuItem.update({
                    where: { id: item.id },
                    data: { 
                        stabilityStatus: newStatus,
                        lastStabilityCheck: new Date(),
                        history: [...currentHistory, newHistoryEntry],
                        retries: newStatus === 'REMOVED' ? (item.retries + 1) : item.retries
                    }
                });
                
                if (newStatus === 'REMOVED') {
                    console.log(`🤖 [Self-Healing] ${item.name} needs replacement!`);
                }

                emitUpdate('stability:update', {
                    itemId: item.id,
                    name: item.name,
                    status: newStatus,
                    confidence: calculateConfidence({...item, stabilityStatus: newStatus}),
                    history: [...currentHistory, newHistoryEntry]
                });
                
                console.log(`📡 [Stability] ${item.name} -> ${newStatus}`);
            }
        }
    });
}
