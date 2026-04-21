import { PrismaClient } from '@prisma/client';
import { generateKnowledgeBaseDocuments, generateTicketSamples } from './seed-data-en';

const prisma = new PrismaClient();

// Generate a pseudo-embedding by converting text to a vector using TF-IDF-like approach
// This is a demonstration - in production, use Gemini or OpenAI embeddings
function generatePseudoEmbedding(text: string): number[] {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  // Create a vocabulary from common words
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'should',
    'could',
    'can',
    'may',
    'might',
    'must',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
  ]);

  const contentWords = words.filter((w) => !stopWords.has(w));

  // Create a fixed-size vector (384 dims like text-embedding-004)
  const vector: number[] = new Array(384).fill(0);

  // Simple hash-based distribution
  for (const word of contentWords) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      const char = word.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    const idx = Math.abs(hash) % 384;
    vector[idx] += 1 / contentWords.length;
  }

  // Normalize vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    return vector.map((v) => v / magnitude);
  }
  return vector;
}

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Clear existing data
  console.log('🗑️  Clearing old data...');
  await prisma.tokenUsage.deleteMany();
  await prisma.ticketLog.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.document.deleteMany();

  // 2. Generate and insert knowledge base documents with pseudo-embeddings
  console.log('📚 Generating knowledge base documents...');
  const documents = generateKnowledgeBaseDocuments();
  console.log(`   Generated ${documents.length} documents`);

  for (const doc of documents) {
    // Generate pseudo-embedding (no API calls needed)
    const embedding = generatePseudoEmbedding(doc.content);
    const embeddingStr = JSON.stringify(embedding);

    await prisma.document.create({
      data: {
        title: doc.title,
        content: doc.content,
        source: doc.source,
        similarity: doc.similarity,
        embedding: embeddingStr,
      },
    });
  }
  console.log('✅ Knowledge base documents imported with embeddings');

  // 3. Generate and insert ticket samples
  console.log('🎫 Generating ticket samples...');
  const tickets = generateTicketSamples();
  console.log(`   Generated ${tickets.length} tickets`);

  for (const ticketData of tickets) {
    await prisma.ticket.create({
      data: {
        content: ticketData.content,
        priority: ticketData.priority,
        status: 'pending',
      },
    });
  }
  console.log('✅ Ticket samples imported');

  console.log('\n✨ Seed completed!');
  console.log(`   📚 Knowledge Base: ${documents.length} documents`);
  console.log(`   🎫 Tickets: ${tickets.length} samples`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
