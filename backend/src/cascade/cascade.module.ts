/**
 * Cascade module - NestJS module definition
 * Manages all providers and exports for cascade levels 1-3.
 */

import { Module } from '@nestjs/common';
import { FAQMatcher } from './faq.matcher';
import { SimpleFilter } from './simple.filter';
import FAQ_DATABASE from './faq.data';
import FILTER_RULES from './rules.data';

/**
 * Provider list
 */
const providers = [
  // FAQ related
  {
    provide: 'FAQ_DATABASE',
    useValue: FAQ_DATABASE
  },
  {
    provide: FAQMatcher,
    useFactory: (faqDatabase: any) => {
      return new FAQMatcher(faqDatabase, 0.9);
    },
    inject: ['FAQ_DATABASE']
  },

  // SimpleFilter related
  {
    provide: 'FILTER_RULES',
    useValue: FILTER_RULES
  },
  {
    provide: SimpleFilter,
    useFactory: (filterRules: any) => {
      return new SimpleFilter(filterRules, 0.7, 0.9);
    },
    inject: ['FILTER_RULES']
  }
];

@Module({
  providers: [...providers],
  exports: [...providers]
})
export class CascadeModule {}
