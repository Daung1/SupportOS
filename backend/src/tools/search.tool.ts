import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ITool } from '../agents/core/execution-context.interface';

@Injectable()
export class SearchTool implements ITool {
  name = 'search';
  description = 'Search knowledge base documents using vector embeddings';

  constructor(private prisma: PrismaService) {}

  async execute(input: { query: string; topK?: number }): Promise<any> {
    const { query, topK = 5 } = input;

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        error: 'Query cannot be empty',
        results: [],
      };
    }

    try {
      // Generate pseudo-embedding for query (no API call needed)
      const queryEmbedding = this.generatePseudoEmbedding(query);

      // Get all documents with embeddings
      const documents = await this.prisma.document.findMany({
        select: {
          id: true,
          title: true,
          content: true,
          source: true,
          embedding: true,
        },
      });

      // Filter documents that have embeddings
      const docsWithEmbeddings = documents.filter(
        (doc) => doc.embedding !== null,
      );

      if (docsWithEmbeddings.length === 0) {
        return {
          success: false,
          error: 'No documents with embeddings found',
          results: [],
        };
      }

      // Calculate cosine similarity for each document
      const scoredDocs = docsWithEmbeddings.map((doc) => {
        const docEmbedding = JSON.parse(doc.embedding!);
        const score = this.cosineSimilarity(queryEmbedding, docEmbedding);
        return {
          ...doc,
          score,
        };
      });

      // Sort and filter by score threshold (0.5 for vector similarity)
      const sorted = scoredDocs
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      const relevant = sorted.filter((doc) => doc.score > 0.1); // Lowered threshold for pseudo-embeddings

      return {
        success: true,
        query,
        results: relevant.map((doc) => ({
          id: doc.id,
          title: doc.title,
          content: doc.content.substring(0, 500),
          source: doc.source,
          score: parseFloat(doc.score.toFixed(4)),
        })),
        count: relevant.length,
      };
    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        results: [],
      };
    }
  }

  private generatePseudoEmbedding(text: string): number[] {
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);

    // Stop words to filter
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must',
      'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
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
      vector[idx] += 1 / Math.max(contentWords.length, 1);
    }

    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      return vector.map((v) => v / magnitude);
    }
    return vector;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      console.warn('Vector dimensions do not match');
      return 0;
    }

    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }
}
