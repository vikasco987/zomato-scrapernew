const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/vikas/.gemini/antigravity-ide/scratch/kravy-pos-website/.env' });

async function removeDuplicates() {
    const client = new MongoClient(process.env.DATABASE_URL);

    try {
        await client.connect();
        const db = client.db();
        const userCollection = db.collection('User');
        const itemCollection = db.collection('Item');

        const targetEmail = "paavi@gmail.com";
        const user = await userCollection.findOne({ email: targetEmail });

        if (!user) {
            console.error(`❌ User not found!`);
            return;
        }

        const items = await itemCollection.find({ userId: user._id }).sort({ createdAt: -1 }).toArray();
        console.log(`📦 Total items: ${items.length}`);

        const seenNames = new Set();
        const duplicateIds = [];

        for (const item of items) {
            // Strip (V), (NV), (Egg) and normalize
            let normalizedName = item.name
                .replace(/\(V\)/gi, '')
                .replace(/\(NV\)/gi, '')
                .replace(/\(Egg\)/gi, '')
                .trim()
                .toLowerCase();

            if (seenNames.has(normalizedName)) {
                // If we have seen this name (ignoring V/NV brackets), the older one is a duplicate
                // (Since we sorted by createdAt: -1, the newer ones are added to 'seenNames' first)
                duplicateIds.push(item._id);
                console.log(`Marked duplicate: ${item.name}`);
            } else {
                seenNames.add(normalizedName);
            }
        }

        console.log(`🗑️ Found ${duplicateIds.length} older duplicate items to remove.`);

        if (duplicateIds.length > 0) {
            const result = await itemCollection.deleteMany({
                _id: { $in: duplicateIds },
                userId: user._id 
            });
            console.log(`✅ Successfully deleted ${result.deletedCount} duplicate items!`);
        }

    } catch (e) {
        console.error("❌ Error:", e);
    } finally {
        await client.close();
    }
}

removeDuplicates();
