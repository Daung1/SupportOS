/**
 * SimpleFilter Rule Database - Level 2 filter data
 * Keyword-based rules for fast ticket classification into 5 main categories
 * Target: 20% of tickets classified with confidence 0.5-0.9
 */

export interface RuleCategory {
  name: string;           // Category name
  keywords: string[];     // Keywords for this category
  description: string;    // Category description
  confidence_boost: number; // Confidence boost for matches
}

export interface FilterRuleLibrary {
  shipping: RuleCategory;
  billing: RuleCategory;
  account: RuleCategory;
  product: RuleCategory;
  policy: RuleCategory;
}

/**
 * Rule library for SimpleFilter
 */
export const FILTER_RULES: FilterRuleLibrary = {
  // ========== Shipping Category ==========
  shipping: {
    name: 'shipping',
    description: 'Shipping, delivery, tracking, address issues',
    confidence_boost: 0.0,
    keywords: [
      // Core shipping terms
      'shipping',
      'delivery',
      'tracking',
      'carrier',
      'courier',
      'mail',
      'parcel',
      'package',
      'shipped',
      'dispatch',
      
      // Delivery methods
      'standard',
      'express',
      'overnight',
      'expedited',
      'two-day',
      'ground',
      'air',
      'priority',
      
      // Delivery issues
      'not arrived',
      'not received',
      'delayed',
      'late',
      'lost',
      'missing',
      'damage',
      'broken',
      'arrived damaged',
      'where is',
      
      // Address related
      'address',
      'address change',
      'address correction',
      'zip code',
      'postal code',
      'apartment',
      'suite',
      'building',
      'delivery address',
      
      // Tracking related
      'track',
      'tracking number',
      'tracking status',
      'trace',
      'locate',
      'where is my',
      'status update',
      'hasn\'t moved',
      
      // Signature and pickup
      'signature',
      'confirmation',
      'pickup',
      'store pickup',
      'hold for pickup',
      'local pickup',
      'retrieval',
      
      // Shipping options
      'free shipping',
      'shipping cost',
      'shipping fee',
      'shipping method',
      'shipping speed',
      'how long',
      'how many days',
      'delivery time',
      
      // International
      'international',
      'worldwide',
      'customs',
      'import',
      'export',
      'border'
    ]
  },

  // ========== Billing Category ==========
  billing: {
    name: 'billing',
    description: 'Payment, charges, refunds, invoices, fees',
    confidence_boost: 0.0,
    keywords: [
      // Payment methods
      'payment',
      'card',
      'credit card',
      'debit card',
      'paypal',
      'apple pay',
      'google pay',
      'bank transfer',
      'check',
      'cash',
      
      // Billing issues
      'charged',
      'charge',
      'billed',
      'bill',
      'invoice',
      'receipt',
      'transaction',
      'duplicate charge',
      'wrong amount',
      'overcharged',
      
      // Refunds
      'refund',
      'refund status',
      'refund time',
      'money back',
      'return refund',
      'partial refund',
      
      // Fees
      'fee',
      'fees',
      'transaction fee',
      'processing fee',
      'late fee',
      'restocking fee',
      'cancellation fee',
      
      // Tax
      'tax',
      'sales tax',
      'tax exempt',
      'tax id',
      'VAT',
      
      // Discounts
      'discount',
      'discount code',
      'promo',
      'promo code',
      'coupon',
      'promotional',
      'sale',
      'special offer',
      'bulk discount',
      
      // Payment plans
      'payment plan',
      'installment',
      'financing',
      'affirm',
      'klarna',
      'afterpay',
      
      // Gift cards
      'gift card',
      'gift card balance',
      'redeem',
      
      // Disputes
      'dispute',
      'chargeback',
      'claim',
      'fraud'
    ]
  },

  // ========== Account Category ==========
  account: {
    name: 'account',
    description: 'Account access, password, profile, settings',
    confidence_boost: 0.0,
    keywords: [
      // Account access
      'login',
      'sign in',
      'sign up',
      'register',
      'registration',
      'account',
      'profile',
      'user account',
      
      // Password
      'password',
      'reset password',
      'forgot password',
      'change password',
      'password reset',
      'reset link',
      'password change',
      'password recovery',
      
      // Account management
      'update profile',
      'edit profile',
      'change email',
      'change phone',
      'update address',
      'notification',
      'preference',
      'setting',
      'privacy setting',
      
      // Security
      'security',
      'two-factor',
      '2fa',
      'authentication',
      'verify account',
      'confirm email',
      'email verification',
      'security code',
      
      // Account problems
      'cannot login',
      'cannot sign in',
      'account locked',
      'locked out',
      'suspended',
      'disabled',
      'deleted account',
      'close account',
      
      // Linked accounts
      'google account',
      'facebook account',
      'payment method',
      'add card',
      'remove card',
      'saved card',
      
      // Order history
      'order history',
      'previous order',
      'past purchase',
      'see order',
      'view order',
      
      // Wishlist and lists
      'wishlist',
      'favorites',
      'saved items',
      'shopping list',
      'save for later'
    ]
  },

  // ========== Product Category ==========
  product: {
    name: 'product',
    description: 'Product features, specifications, quality, availability',
    confidence_boost: 0.0,
    keywords: [
      // Product details
      'product',
      'item',
      'product description',
      'what is',
      'about this',
      'specification',
      'spec',
      'feature',
      'feature request',
      
      // Size and dimensions
      'size',
      'sizing',
      'dimensions',
      'measurement',
      'how big',
      'how large',
      'weight',
      'height',
      'width',
      'length',
      'fit',
      
      // Materials and composition
      'material',
      'fabric',
      'composition',
      'content',
      'what is it made',
      'ingredient',
      'component',
      'construction',
      
      // Color and options
      'color',
      'colour',
      'available colors',
      'color options',
      'what colors',
      'color available',
      
      // Stock and availability
      'stock',
      'in stock',
      'out of stock',
      'availability',
      'available',
      'backorder',
      'when available',
      'restock',
      'when back in stock',
      
      // Product quality
      'quality',
      'durability',
      'defect',
      'defective',
      'broken',
      'faulty',
      'problem',
      'issue',
      'warranty',
      'guarantee',
      
      // Usage and instructions
      'how to use',
      'use',
      'usage',
      'instruction',
      'guide',
      'manual',
      'how does it work',
      'how to set up',
      'assembly',
      
      // Comparison
      'compare',
      'difference',
      'similar',
      'alternative',
      'similar product',
      'other option',
      
      // Recommendation
      'recommend',
      'recommendation',
      'which one',
      'should i',
      'better',
      'best',
      'reviewed'
    ]
  },

  // ========== Policy Category ==========
  policy: {
    name: 'policy',
    description: 'Company policies, terms, conditions, rules',
    confidence_boost: 0.0,
    keywords: [
      // General policies
      'policy',
      'policies',
      'terms',
      'terms of service',
      'condition',
      'condition of use',
      'agreement',
      'rule',
      'regulation',
      
      // Return and exchange
      'return policy',
      'return',
      'exchange',
      'return condition',
      'return time',
      'how to return',
      'return process',
      'exchange process',
      
      // Shipping policy
      'shipping policy',
      'delivery guarantee',
      'shipping guarantee',
      'delivery policy',
      
      // Privacy and security
      'privacy',
      'privacy policy',
      'data',
      'data collection',
      'data privacy',
      'security',
      'cookie',
      'tracking',
      
      // Rights and liability
      'liability',
      'responsible',
      'responsibility',
      'rights',
      'customer rights',
      'right to',
      'not liable',
      
      // Legal terms
      'legal',
      'law',
      'jurisdiction',
      'dispute resolution',
      'arbitration',
      'lawsuit',
      'claim',
      
      // Accessibility
      'accessibility',
      'accessible',
      'disability',
      'ada',
      'wcag',
      
      // Prohibited activities
      'prohibited',
      'cannot',
      'not allowed',
      'illegal',
      'fraud',
      'abuse',
      'violation',
      
      // Account policies
      'account policy',
      'account agreement',
      'membership',
      'subscription',
      'cancel subscription',
      
      // Miscellaneous
      'right to refuse',
      'force majeure',
      'limitation',
      'indemnify',
      'warranty disclaimer'
    ]
  }
};

export default FILTER_RULES;
