/**
 * Cascade module - NestJS module definition
 * Manages all providers and exports for cascade levels 1-3.
 */

import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { FAQMatcher } from './faq.matcher';
import { SimpleFilter } from './simple.filter';
import { CascadeOrchestrator } from './cascade-orchestrator.service';
import FAQ_DATABASE from './faq.data';
import FILTER_RULES from './rules.data';

const providers = [
  {
    provide: 'FAQ_DATABASE',
    useValue: FAQ_DATABASE,
  },
  {
    provide: FAQMatcher,
    useFactory: (faqDatabase: any) => {
      return new FAQMatcher(faqDatabase, 0.9);
    },
    inject: ['FAQ_DATABASE'],
  },
  {
    provide: 'FILTER_RULES',
    useValue: FILTER_RULES,
  },
  {
    provide: SimpleFilter,
    useFactory: (filterRules: any) => {
      // Thresholds re-calibrated for the saturation confidence
      // formula introduced by TD-1 fix:
      //   1 keyword  -> 0.33 (below min, escalate to L3)
      //   2 keywords -> 0.67 (accepted L2 hit)
      //   3+         -> 1.00 (accepted L2 hit)
      // Upper bound is 1.0 (was 0.9) because the saturation formula
      // has no runaway behaviour to cap; previously the upper bound
      // was a safety net against the divisor-only formula.
      return new SimpleFilter(filterRules, 0.5, 1.0);
    },
    inject: ['FILTER_RULES'],
  },
  CascadeOrchestrator,
];

@Module({
  // AgentsModule exposes MultiAgentOrchestrator which is required for
  // L3 fallback.  Importing the module instead of re-providing keeps
  // the pipeline/provider/orchestrator wiring in a single place.
  imports: [AgentsModule],
  providers: [...providers],
  exports: [...providers],
})
export class CascadeModule {}
