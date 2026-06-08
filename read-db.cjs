const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://Krishna:Radha%40987@billgsoftware.lprzjz2.mongodb.net/Billgsoftware?retryWrites=true&w=majority&appName=Billgsoftware";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db('Billgsoftware');
    
    // Find user
    let user = await db.collection('User').findOne({ $or: [{ phone: "8826529438" }, { email: "Mrarjunk938@gmail.com" }, { clerkId: "8826529438" }, { _id: "Mrarjunk938@gmail.com" }]});
    
    if (user) {
      console.log("User found. ID:", user._id, "clerkId:", user.clerkId);
      // Let's find items
      let items = await db.collection('Item').find({ userId: user._id }).toArray();
      if (items.length === 0 && user.clerkId) {
        items = await db.collection('Item').find({ clerkId: user.clerkId }).toArray();
      }
      
      console.log(`Found ${items.length} items`);
      
      // group by name to see duplicates
      const nameCounts = {};
      items.forEach(i => {
        nameCounts[i.name] = (nameCounts[i.name] || 0) + 1;
      });
      const dups = Object.keys(nameCounts).filter(k => nameCounts[k] > 1);
      console.log("Duplicate item names:", dups);
      
      const dupItems = items.filter(i => dups.includes(i.name)).map(i => ({ _id: i._id, name: i.name, price: i.price, categoryId: i.categoryId }));
      console.log("Dup items:", JSON.stringify(dupItems, null, 2));
    } else {
      console.log("User not found");
      const sampleUser = await db.collection('User').findOne({});
      console.log("Sample user:", sampleUser ? Object.keys(sampleUser) : "None");
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
