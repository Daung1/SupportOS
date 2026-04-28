/**
 * Gemini token pricing table + helpers.
 *
 * Prices are quoted per one million tokens in USD and reflect Google's
 * public rate sheet as of late 2025.  When Google changes the prices,
 * update the PRICING_TABLE below - no other code should hard-code rates.
 *
 * Notes:
 * - We intentionally return 0 (not `undefined`) for unknown models so
 *   that cost aggregation never blows up in production.  A warning log
 *   at the call site makes the missing model visible to ops.
 * - All math is done in integer micro-dollars internally to avoid the
 *   classic floating-point artefacts you hit when summing millions of
 *   small numbers, then divided back to a USD `number` at the edge.
 */

/** Price per 1M tokens, USD. */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Default pricing table.  Extend when new models become available.
 * Keys are matched case-insensitively; passing 'gemini-2.5-flash'
 * and 'Gemini-2.5-Flash' both resolve to the same entry.
 */
export const PRICING_TABLE: Record<string, ModelPricing> = {
  'gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.0 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.0 },
};

/**
 * Resolve a pricing entry for the given model, case-insensitively.
 * Returns undefined if unknown so callers can warn/alert.
 */
export function getModelPricing(model: string): ModelPricing | undefined {
  if (!model) return undefined;
  return PRICING_TABLE[model.toLowerCase()];
}

/**
 * Compute cost in USD for the given token counts under the given model.
 * Unknown model -> 0 (safe default).  Negative counts are clamped to 0.
 */
export function calculateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model);
  if (!pricing) return 0;

  const safeInput = Math.max(0, Math.floor(inputTokens));
  const safeOutput = Math.max(0, Math.floor(outputTokens));

  // Work in micro-dollars (1 USD = 1_000_000 micro) to avoid fp drift
  // when many small rows are aggregated.  The final divide yields a
  // regular USD number with at most 6 decimal places of precision.
  const inputMicro = Math.round(
    (safeInput * pricing.inputPer1M * 1_000_000) / 1_000_000,
  );
  const outputMicro = Math.round(
    (safeOutput * pricing.outputPer1M * 1_000_000) / 1_000_000,
  );
  return (inputMicro + outputMicro) / 1_000_000;
}

/**
 * Aggregate many (model, inTokens, outTokens) rows into a single cost.
 * Rows with different models are priced individually and summed.
 */
export function aggregateCostUsd(
  rows: Array<{ model: string; inputTokens: number; outputTokens: number }>,
): number {
  let totalMicro = 0;
  for (const row of rows) {
    totalMicro += Math.round(calculateCostUsd(
      row.model,
      row.inputTokens,
      row.outputTokens,
    ) * 1_000_000);
  }
  return totalMicro / 1_000_000;
}
