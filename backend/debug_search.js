const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Jaccard similarity function from search.tool.ts
function jaccardSimilarity(set1, set2) {
  const intersection = new Set(set1.filter((item) => set2.includes(item)));
  const union = new Set([...set1, ...set2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// Calculate similarity (same as search.tool.ts)
function calculateSimilarity(query, title, content) {
  const q = query.toLowerCase();
  const t = title.toLowerCase();
  const c = content.toLowerCase();

  let score = 0;

  if (t === q) score += 0.5;
  if (t.includes(q)) score += 0.3;
  if (c.includes(q)) score += 0.15;

  const queryTerms = q.split(/\s+/).filter((term) => term.length > 0);
  const titleTerms = t.split(/\s+/);
  const contentTerms = c.split(/\s+/);

  for (const term of queryTerms) {
    if (titleTerms.some((t) => t.includes(term))) score += 0.02;
    if (contentTerms.some((c) => c.includes(term))) score += 0.01;
  }

  const jaccard = jaccardSimilarity(queryTerms, titleTerms);
  score += jaccard * 0.04;

  return Math.min(score, 1.0);
}

async function main() {
  const tests = [
    { query: "How do I return a defective product?", label: "Test 1 (Return)" },
    { query: "How long does shipping take?", label: "Test 2 (Shipping)" },
    { query: "How do I secure my account?", label: "Test 3 (Security)" },
  ];

  for (const test of tests) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${test.label}`);
    console.log(`Query: "${test.query}"`);
    console.log("=".repeat(60));

    const docs = await prisma.document.findMany({
      select: { id: true, title: true, content: true, source: true },
    });

    const scored = docs.map((doc) => ({
      title: doc.title,
      source: doc.source,
      score: calculateSimilarity(test.query, doc.title, doc.content),
    }));

    // Top 10 scores
    const top10 = scored.sort((a, b) => b.score - a.score).slice(0, 10);
    
    console.log("\nTop 10 results:");
    top10.forEach((doc, idx) => {
      const pass = doc.score > 0.1 ? "✅ PASS (>0.1)" : "❌ FAIL (≤0.1)";
      console.log(
        `${idx + 1}. Score: ${doc.score.toFixed(4)} ${pass} - ${doc.title} [${doc.source}]`
      );
    });

    // Check if any docs pass 0.1 threshold
    const passed = scored.filter((doc) => doc.score > 0.1);
    console.log(`\nTotal docs passing 0.1 threshold: ${passed.length}/${docs.length}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
