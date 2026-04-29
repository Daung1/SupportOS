/**
 * Rule-based checker for immediate rejection based on content policies.
 * 
 * Checks:
 * - Blacklisted sensitive keywords
 * - Prohibited patterns
 * - Policy violations
 */
export class RuleChecker {
  /**
   * Sensitive and prohibited keywords that trigger immediate rejection.
   * Includes: hate speech, violence incitement, explicit content markers.
   */
  private readonly blacklist: Set<string> = new Set([
    // Hate/discrimination
    'hate', 'racist', 'sexist', 'discriminate',
    // Violence
    'kill', 'murder', 'bomb', 'explode', 'weapon',
    // Explicit
    'sex', 'porn', 'xxx',
    // Scam/fraud
    'scam', 'fraud', 'phishing', 'malware',
    // Illegal activity
    'illegal', 'criminal', 'stolen',
  ]);

  /**
   * Regex patterns for more sophisticated detection
   */
  private readonly patterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\b(?:call|email|click)\s+now\b/i, label: 'urgency_trigger' },
    { pattern: /\b(?:bitcoin|crypto|nft)\b/i, label: 'speculative_asset' },
    { pattern: /\b(?:password|pin|credit\s+card)\b/i, label: 'credential_request' },
  ];

  /**
   * Check content for policy violations.
   * Returns first violation found, or undefined if clean.
   */
  check(content: string): { violated: boolean; reason: string } {
    const normalized = content.toLowerCase();

    // Check blacklisted keywords
    for (const keyword of this.blacklist) {
      if (normalized.includes(keyword)) {
        return {
          violated: true,
          reason: `Blacklisted keyword detected: "${keyword}"`,
        };
      }
    }

    // Check patterns
    for (const { pattern, label } of this.patterns) {
      if (pattern.test(content)) {
        return {
          violated: true,
          reason: `Policy pattern violation: ${label}`,
        };
      }
    }

    return { violated: false, reason: '' };
  }
}
