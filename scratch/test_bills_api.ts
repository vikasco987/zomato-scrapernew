import axios from "axios";

async function test() {
    try {
        const clerkId = "USER_3DTILIZYNNWI6WFZA9BICZG8DNM";
        console.log(`🌐 Fetching bills from API for: ${clerkId}...`);
        const res = await axios.get(`http://localhost:3005/api/merchant/bills/${clerkId}`);
        console.log("🟢 Response Status:", res.status);
        console.log("📊 Stats:", res.data.stats);
        console.log("🧾 Bills Count in response:", res.data.bills ? res.data.bills.length : "undefined");
        if (res.data.bills && res.data.bills.length > 0) {
            console.log("✨ Sample bill from response:", res.data.bills[0]);
        }
    } catch (e: any) {
        console.error("❌ Test failed:", e.message);
        if (e.response) {
            console.error("❌ Response data:", e.response.data);
        }
    }
}

test();
