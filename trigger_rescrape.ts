import { queueManager } from "./src/lib/queueManager.js";
import { prisma } from "./src/db/index.js";

async function run() {
    console.log("Triggering re-scrape for Punjabi Chicken Corner...");
    // The clerkId from our previous database check
    const clerkId = "custom_1780642646233_q0qcha";
    
    // Add job to the queue
    await queueManager.addJob(clerkId, 106);
    
    console.log("Job added to queue! The backend server will pick it up and begin downloading the new images.");
}

run().catch(console.error);
