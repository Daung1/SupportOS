import { RuleChecker } from './rule.checker';

describe('RuleChecker', () => {
  let checker: RuleChecker;

  beforeEach(() => {
    checker = new RuleChecker();
  });

  it('should pass clean content', () => {
    const result = checker.check('How to update my account information?');
    expect(result.violated).toBe(false);
    expect(result.reason).toBe('');
  });

  it('should reject content with blacklisted keywords', () => {
    const result = checker.check('I want to bomb this system');
    expect(result.violated).toBe(true);
    expect(result.reason).toContain('bomb');
  });

  it('should reject multiple keywords', () => {
    const result = checker.check('This is a scam that uses stolen data');
    expect(result.violated).toBe(true);
  });

  it('should catch urgency trigger pattern', () => {
    const result = checker.check('You must call now to verify your account');
    expect(result.violated).toBe(true);
    expect(result.reason).toContain('urgency_trigger');
  });

  it('should catch crypto asset references', () => {
    const result = checker.check('We accept Bitcoin payments');
    expect(result.violated).toBe(true);
    expect(result.reason).toContain('speculative_asset');
  });

  it('should catch credential requests', () => {
    const result = checker.check('Please provide your credit card number');
    expect(result.violated).toBe(true);
    expect(result.reason).toContain('credential_request');
  });

  it('should be case-insensitive', () => {
    const result = checker.check('This is a SCAM');
    expect(result.violated).toBe(true);
  });

  it('should return false for multiple violations', () => {
    const result = checker.check('Bomb the system with stolen bitcoin data');
    expect(result.violated).toBe(true);
    // Should catch first violation
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('should allow legitimate technical content', () => {
    const result = checker.check(
      'Here are the steps to configure your firewall: 1. Check settings 2. Enable protection',
    );
    expect(result.violated).toBe(false);
  });
});
