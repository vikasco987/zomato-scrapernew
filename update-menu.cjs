const { MongoClient, ObjectId } = require('mongodb');
const uri = "mongodb+srv://Krishna:Radha%40987@billgsoftware.lprzjz2.mongodb.net/Billgsoftware?retryWrites=true&w=majority&appName=Billgsoftware";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db('Billgsoftware');
    const user = await db.collection('User').findOne({ phone: "8826529438" });
    
    if (!user) {
        console.log("User not found!");
        return;
    }
    
    const items = await db.collection('Item').find({ userId: user._id }).toArray();
    let updatedCount = 0;
    
    // Group by name
    const nameCounts = {};
    items.forEach(i => {
      if (!nameCounts[i.name]) nameCounts[i.name] = [];
      nameCounts[i.name].push(i);
    });
    
    for (const name in nameCounts) {
      const group = nameCounts[name];
      if (group.length > 1) {
        // Sort by price ascending
        group.sort((a, b) => a.price - b.price);
        
        for (let i = 0; i < group.length; i++) {
          let suffix = '';
          if (group.length === 3) {
            if (i === 0) suffix = ' (R)';
            else if (i === 1) suffix = ' (M)';
            else if (i === 2) suffix = ' (L)';
          } else if (group.length === 2) {
             // For 2 items, guess based on price
             if (group[0].price >= 150 && group[1].price >= 240 && !name.includes("Spicy Veggie") && !name.includes("Veggie Delight") && !name.includes("Tandoori Paneer")) {
                 if (i===0) suffix = ' (M)';
                 if (i===1) suffix = ' (L)';
             } else {
                 if (i===0) suffix = ' (R)';
                 if (i===1) suffix = ' (L)'; // or M, mostly standard
             }
          }
          
          if (suffix) {
            let newName = group[i].name;
            // append suffix before any other trailing spaces if any, or just append
            if (newName.endsWith('(V)')) {
                newName = newName.replace('(V)', '(V)' + suffix);
            } else {
                newName = newName + suffix;
            }
            
            console.log(`Updating ${group[i].name} (Price: ${group[i].price}) -> ${newName}`);
            await db.collection('Item').updateOne({ _id: group[i]._id }, { $set: { name: newName } });
            updatedCount++;
          }
        }
      }
    }
    console.log(`Done updating ${updatedCount} menu items!`);
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
