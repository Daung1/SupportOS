/**
 * DocumentEmbeddingService — keeps the KB Document table and its
 * precomputed Gemini vectors in lockstep, so SearchTool can do real
 * semantic retrieval at request time without paying the embedding
 * cost on every query.
 *
 * Lifecycle (mirrors FAQEmbeddingService - same shape, different source
 * of truth):
 *   1. onModuleInit reads every row from `documentEmbedding`.
 *   2. We pull every Document from the DB (this is the canonical KB
 *      list - unlike FAQs which are baked into a TS array). For each
 *      document we hash the embed-text; if the persisted hash differs,
 *      or the row is missing, or the embedding model changed, we
 *      re-embed and upsert.
 *   3. Final {docId -> vector} map is held in memory for O(1) cosine
 *      lookup by SearchTool. We never read embeddings from DB at
 *      request time so the L3 retrieval path is I/O-free.
 *
 * Why a stateful singleton:
 *   - the KB has the same order-of-magnitude size as the FAQ corpus,
 *     well within process memory comfort,
 *   - re-embedding on content/model change keeps subsequent boots
 *     fast while still catching drift,
 *   - bypassing per-request embedding flips Searcher's per-iteration
 *     LLM cost from "1 think + 1 hash" to "1 think + 0 calls",
 *     materially shrinking the Gemini exposure surface for transient
 *     503/429 outages.
 *
 * Failure mode: if the embedding API is unreachable on first boot we
 * log loud and surface `isReady() === false`. SearchTool then returns
 * empty results so Searcher fails-soft without crashing the pipeline
 * (which itself fails soft via failurePolicy='continue' on the
 * Searcher route).
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { GeminiService } from '../gemini/gemini.service';

export interface KBDocument {
  id: string;
  title: string;
  content: string;
  source: string | null;
}

/**
 * Build the canonical text we feed to the embedder for a given KB
 * document. Title + content keeps both the headline tokens and the
 * detail tokens in one vector; trimming overly long content avoids
 * paying for tail tokens that contribute little to retrieval quality
 * (most Gemini embedding sweet spot is ~512 tokens of context).
 *
 * Keep this function pure and deterministic - its output feeds the
 * contentHash, so any change here invalidates every persisted
 * embedding on the next boot (which is the desired behaviour).
 */
export function buildDocumentEmbedText(doc: KBDocument): string {
  // Cap the content portion to keep us under the model's effective
  // context limit and to make the cost predictable. KB articles are
  // typically <= 1500 chars; the cap is intentionally generous so we
  // only truncate genuine outliers.
  const trimmed =
    doc.content.length > 4000
      ? doc.content.slice(0, 4000)
      : doc.content;
  return `${doc.title}\n\n${trimmed}`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Cosine similarity. Vectors are assumed to be from the same model.
 * Re-implemented here (instead of importing from cascade/) to avoid
 * tools/ depending on cascade/ - that would invert the layering since
 * cascade composes tools, not the other way around.
 */
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
export class DocumentEmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(DocumentEmbeddingService.name);
  private cache = new Map<string, { doc: KBDocument; vector: number[] }>();
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
        `Document embeddings ready (${this.cache.size} vectors loaded)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Document embedding bootstrap failed: ${message}. ` +
          `SearchTool will return empty results until restart.`,
      );
    }
  }

  /**
   * Whether the in-memory cache is populated. SearchTool should
   * surface a graceful "no results" rather than crashing when this
   * returns false (e.g. if the embedding service is still booting or
   * the API was unreachable at startup).
   */
  isReady(): boolean {
    return this.ready && this.cache.size > 0;
  }

  /**
   * Snapshot of the cache shape used by SearchTool. We expose the
   * Document row alongside its vector so the consumer can render
   * title / source without a second DB lookup.
   */
  getEmbeddings(): Array<{ doc: KBDocument; vector: number[] }> {
    return Array.from(this.cache.values());
  }

  // ---------------------------------------------------------------------------

  private async syncAndLoad(): Promise<void> {
    const documents: KBDocument[] = await this.prisma.document.findMany({
      select: { id: true, title: true, content: true, source: true },
    });
    if (documents.length === 0) {
      this.logger.warn(
        'No KB documents found in database; SearchTool will return empty results.',
      );
      return;
    }

    const dbRows = await this.prisma.documentEmbedding.findMany();
    const dbByDocId = new Map(dbRows.map((r) => [r.docId, r]));

    const stale: Array<{ doc: KBDocument; text: string; hash: string }> = [];
    for (const doc of documents) {
      const text = buildDocumentEmbedText(doc);
      const hash = sha256(text);
      const row = dbByDocId.get(doc.id);
      const isFresh =
        row &&
        row.contentHash === hash &&
        row.model === GeminiService.EMBEDDING_MODEL;
      if (isFresh) {
        const vec = this.parseVector(row!.vector, doc.id);
        if (vec) this.cache.set(doc.id, { doc, vector: vec });
        else stale.push({ doc, text, hash });
      } else {
        stale.push({ doc, text, hash });
      }
    }

    if (stale.length > 0) {
      this.logger.log(
        `Re-embedding ${stale.length} document(s) (model=${GeminiService.EMBEDDING_MODEL})`,
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

      for (let i = 0; i < stale.length; i++) {
        const { doc, hash } = stale[i];
        const vec = vectors[i];
        const serialized = JSON.stringify(vec);
        await this.prisma.documentEmbedding.upsert({
          where: { docId: doc.id },
          create: {
            docId: doc.id,
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
        this.cache.set(doc.id, { doc, vector: vec });
      }
    }

    // Drop stale rows whose Document id no longer exists in the KB so
    // the embedding table doesn't accumulate orphans across content
    // edits / re-imports.
    const liveIds = new Set(documents.map((d) => d.id));
    const orphaned = dbRows.filter((r) => !liveIds.has(r.docId));
    if (orphaned.length > 0) {
      await this.prisma.documentEmbedding.deleteMany({
        where: { docId: { in: orphaned.map((r) => r.docId) } },
      });
      this.logger.log(
        `Removed ${orphaned.length} orphaned document embedding(s)`,
      );
    }
  }

  private parseVector(json: string, docId: string): number[] | null {
    try {
      const v = JSON.parse(json);
      if (Array.isArray(v) && v.every((n) => typeof n === 'number')) {
        return v;
      }
      this.logger.warn(`Invalid embedding shape for ${docId}, will re-embed`);
      return null;
    } catch {
      this.logger.warn(`Unparseable embedding for ${docId}, will re-embed`);
      return null;
    }
  }
}
