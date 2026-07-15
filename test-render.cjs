const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.foodImage.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 });
  try {
    items.map(item => {
        const safeName = (item.foodName || "Unknown").replace(/['"\\]/g, '\\$&');
        const displayName = item.foodName || "Unknown";
        return `
        <div class="glass-card group overflow-hidden relative border-white/5 hover:border-orange-500/30">
            <img src="${item.cloudinaryUrl}" class="aspect-[4/3] w-full object-cover group-hover:scale-105 transition-all duration-500">
            <div class="p-6">
                <div class="flex justify-between items-start">
                    <h3 class="font-bold truncate text-lg">${displayName}</h3>
                    <button onclick="openOverrideModal('${item.id}', '${safeName}')" class="p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white">⚙️</button>
                </div>
                <div class="flex items-center gap-3 mt-4 opacity-40 text-[10px] font-black uppercase tracking-[0.2em]">
                    <span>Score: ${item.confidence || 0}%</span>
                    <span>•</span>
                    <span class="${item.isManual ? 'text-blue-400' : ''}">${item.isManual ? 'Manual' : 'Sync'}</span>
                </div>
            </div>
        </div>
        `
    }).join('');
    console.log("Render logic passed without errors.");
  } catch(e) {
      console.log("Error in map:", e);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
