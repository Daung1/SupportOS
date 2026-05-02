/**
 * FAQEmbeddingService — keeps the FAQ corpus and its precomputed
 * vectors in lockstep.
 *
 * Lifecycle:
 *   1. onModuleInit reads every row from FAQEmbedding (DB).
 *   2. For each FAQ in FAQ_DATABASE we compute a content hash; if the
 *      DB-row hash differs (or the row is missing, or the embedding
 *      model changed) we re-embed and upsert.
 *   3. The final {faqId -> vector} map is held in memory for O(1)
 *      access by FAQMatcher. We never read embeddings from DB at
 *      request time — this keeps the L1 path I/O-free.
 *
 * We deliberately keep this as a stateful singleton (not on every
 * request) because:
 *   - the FAQ corpus is small enough (240KB / 80 entries) to live
 *     in process memory comfortably,
 *   - embedding 80 short texts in one batch is much cheaper than 80
 *     individual calls (1 round trip vs 80),
 *   - regenerating only on content/model change keeps boot fast
 *     after the first run.
 *
 * If the embedding API is unreachable on first boot we surface the
 * error: there is no graceful fallback because the L1 matcher itself
 * needs the vectors to function. Callers higher up the stack should
 * decide whether to keep serving (degraded) or fail fast.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { GeminiService } from '../gemini/gemini.service';
import FAQ_DATABASE, { FAQ } from './faq.data';

/**
 * Build the canonical text we feed to the embedder for a given FAQ.
 * The format is intentionally rich (question + tag list + category)
 * because text-embedding-004 benefits from a small amount of context:
 * embedding `question` alone leaves too few signal-bearing tokens
 * for short FAQs like "Is gift wrapping available?".
 *
 * Note: keep this function pure and deterministic — its output is
 * fed into the contentHash, so any change here invalidates every
 * persisted embedding on the next boot (which is what we want).
 */
export function buildFaqEmbedText(faq: FAQ): string {
  const keywords = faq.keywords.join(', ');
  return `${faq.question}\n\nKeywords: ${keywords}\nCategory: ${faq.category}`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Cosine similarity. Vectors are assumed to be from the same model. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

@Injectable()
export class FAQEmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(FAQEmbeddingService.name);
  private cache = new Map<string, number[]>();
  private ready = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.syncAndLoad();
      this.ready = true;
      this.logger.log(
        `FAQ embeddings ready (${this.cache.size} vectors loaded)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `FAQ embedding bootstrap failed: ${message}. ` +
          `L1 vector matcher will be disabled until restart.`,
      );
    }
  }

  /**
   * Whether the in-memory cache is populated. FAQMatcher should fall
   * back to "no match" if this is false, rather than embedding queries
   * against an empty corpus.
   */
  isReady(): boolean {
    return this.ready && this.cache.size > 0;
  }

  /**
   * Snapshot of the cache shape used by FAQMatcher. We expose the FAQ
   * row alongside its vector so the matcher can return the original
   * answer text without needing a second lookup table.
   */
  getEmbeddings(): Array<{ faq: FAQ; vector: number[] }> {
    const out: Array<{ faq: FAQ; vector: number[] }> = [];
    for (const faq of FAQ_DATABASE) {
      const vec = this.cache.get(faq.id);
      if (vec) out.push({ faq, vector: vec });
    }
    return out;
  }

  // ---------------------------------------------------------------------------

  private async syncAndLoad(): Promise<void> {
    const dbRows = await this.prisma.fAQEmbedding.findMany();
    const dbByFaqId = new Map(dbRows.map((r) => [r.faqId, r]));

    const stale: Array<{ faq: FAQ; text: string; hash: string }> = [];
    for (const faq of FAQ_DATABASE) {
      const text = buildFaqEmbedText(faq);
      const hash = sha256(text);
      const row = dbByFaqId.get(faq.id);
      const isFresh =
        row &&
        row.contentHash === hash &&
        row.model === GeminiService.EMBEDDING_MODEL;
      if (isFresh) {
        const vec = this.parseVector(row!.vector, faq.id);
        if (vec) this.cache.set(faq.id, vec);
        else stale.push({ faq, text, hash });
      } else {
        stale.push({ faq, text, hash });
      }
    }

    if (stale.length > 0) {
      this.logger.log(
        `Re-embedding ${stale.length} FAQ(s) (model=${GeminiService.EMBEDDING_MODEL})`,
      );
      const vectors = await this.gemini.embedBatch(
        stale.map((s) => s.text),
        'RETRIEVAL_DOCUMENT',
      );
      if (vectors.length !== stale.length) {
        throw new Error(
          `embedBatch returned ${vectors.length} vectors, expected ${stale.length}`,
        );
      }

      // Persist + populate cache.
      // We use individual upserts rather than createMany so each row
      // can carry its own contentHash and we can pick up partial
      // failures cleanly (Prisma createMany doesn't support upsert).
      for (let i = 0; i < stale.length; i++) {
        const { faq, hash } = stale[i];
        const vec = vectors[i];
        const serialized = JSON.stringify(vec);
        await this.prisma.fAQEmbedding.upsert({
          where: { faqId: faq.id },
          create: {
            faqId: faq.id,
            vector: serialized,
            contentHash: hash,
            model: GeminiService.EMBEDDING_MODEL,
          },
          update: {
            vector: serialized,
            contentHash: hash,
            model: GeminiService.EMBEDDING_MODEL,
          },
        });
        this.cache.set(faq.id, vec);
      }
    }

    // Drop stale rows whose FAQ id no longer exists in the corpus, so
    // we don't keep growing the table forever as FAQs get retired.
    const liveIds = new Set(FAQ_DATABASE.map((f) => f.id));
    const orphaned = dbRows.filter((r) => !liveIds.has(r.faqId));
    if (orphaned.length > 0) {
      await this.prisma.fAQEmbedding.deleteMany({
        where: { faqId: { in: orphaned.map((r) => r.faqId) } },
      });
      this.logger.log(`Removed ${orphaned.length} orphaned FAQ embedding(s)`);
    }
  }

  private parseVector(json: string, faqId: string): number[] | null {
    try {
      const v = JSON.parse(json);
      if (Array.isArray(v) && v.every((n) => typeof n === 'number')) {
        return v;
      }
      this.logger.warn(`Invalid embedding shape for ${faqId}, will re-embed`);
      return null;
    } catch {
      this.logger.warn(`Unparseable embedding for ${faqId}, will re-embed`);
      return null;
    }
  }
}
