/**
 * demo.ts —— 一键演示：入库示例文本 → 语义检索 → 跨模态提示
 * 用法：pnpm demo
 */
import { addTexts, searchText, stats, clearAll, type StoreItem } from "./vectorstore.js";

const demoTexts: { name: string; content: string }[] = [
  {
    name: "cat.txt",
    content: "A cat is sitting on the windowsill, watching the birds outside.",
  },
  {
    name: "dog.txt",
    content: "A golden retriever is running happily in the park, chasing a tennis ball.",
  },
  {
    name: "car.txt",
    content: "A red sports car is speeding down the highway, leaving a trail of dust.",
  },
  {
    name: "food.txt",
    content: "A delicious plate of sushi with fresh salmon and avocado on top.",
  },
  {
    name: "tech.txt",
    content:
      "The new laptop features a powerful processor, 32GB of RAM, and a stunning OLED display.",
  },
  {
    name: "nature.txt",
    content:
      "The majestic mountain peaks are covered with snow, reflecting the golden light of sunset.",
  },
];

async function runDemo() {
  console.log("═══════════════════════════════════════");
  console.log("  本地 Embedding（Transformers.js）Demo");
  console.log("═══════════════════════════════════════\n");

  // Step 1: 入库
  console.log("📥 Step 1: 文本向量化入库...");
  clearAll();
  const items: StoreItem[] = demoTexts.map((t) => ({
    id: `demo:${t.name}`,
    type: "text" as const,
    content: t.content,
    source: t.name,
  }));
  await addTexts(items);
  const s = stats();
  console.log(`   ✅ 入库完成 | 条目数: ${s.count} | 维度: ${s.vectorDim}\n`);

  // Step 2: 文本检索
  console.log("🔍 Step 2: 语义检索测试\n");
  const queries = [
    "a cute pet animal",
    "something fast and motorized",
    "tasty Japanese cuisine",
    "computer hardware specifications",
  ];
  for (const q of queries) {
    const results = await searchText(q, 3);
    console.log(`   🔎 "${q}"`);
    if (results.length === 0) {
      console.log("      ⚠️  未找到结果\n");
    } else {
      results.forEach((r, i) => {
        console.log(`      ${i + 1}. [${r.score.toFixed(3)}] ${r.content.slice(0, 60)}...`);
      });
      console.log();
    }
  }

  // Step 3: 提示跨模态能力
  console.log("💡 Step 3: 跨模态检索\n");
  console.log("   当前使用 CLIP 模型，文本和图片在同一向量空间。");
  console.log("   将图片放入 data/images/ 后可体验跨模态检索：");
  console.log("   - pnpm index                              # 入库图片");
  console.log("   - pnpm search --image ./data/images/xx.jpg  # 以图搜库\n");

  console.log("✅ Demo 完成！试试 pnpm search 或 pnpm index");
}

runDemo().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
