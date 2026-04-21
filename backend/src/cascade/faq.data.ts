/**
 * FAQ Database - Level 1 matcher data
 * Contains 80+ pre-built frequently asked questions for customer service domain
 * Covers main categories: shipping, billing, product, account, policy, return
 * Target: 60% of tickets have high-confidence matches (similarity >= 0.9)
 */

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: 'shipping' | 'billing' | 'product' | 'account' | 'policy' | 'return';
  frequency: number; // Frequency rank (1-100)
}

export const FAQ_DATABASE: FAQ[] = [
  // ========== Shipping Category (20 FAQs) ==========
  {
    id: 'shipping_001',
    question: 'How long does standard shipping take?',
    answer: 'Standard shipping typically takes 5-7 business days. We ship from Monday to Friday. Most orders are processed within 24 hours. Tracking information is provided once the order ships.',
    keywords: ['shipping', 'delivery', 'time', 'standard', 'days', 'tracking'],
    category: 'shipping',
    frequency: 95
  },
  {
    id: 'shipping_002',
    question: 'What is the shipping cost?',
    answer: 'Shipping cost depends on: 1. Order value ($0 for orders over $50), 2. Destination area (domestic $5-15, international $20-50), 3. Shipping method. For expedited shipping add $10. View exact cost at checkout before payment.',
    keywords: ['shipping', 'cost', 'fee', 'charge', 'price'],
    category: 'shipping',
    frequency: 92
  },
  {
    id: 'shipping_003',
    question: 'Can I change shipping address after placing order?',
    answer: 'Address changes are possible within 2 hours of order placement (before warehouse processing). Contact support immediately with your order ID. Provide new address details. Changes within 24 hours may incur $5 fee.',
    keywords: ['address', 'change', 'modify', 'shipping', 'update'],
    category: 'shipping',
    frequency: 88
  },
  {
    id: 'shipping_004',
    question: 'Do you offer express or overnight shipping?',
    answer: 'Yes, we offer multiple expedited options: 1. Next-day: $25 surcharge, arrives 1 business day, 2. 2-day: $15 surcharge, arrives 2 business days. Express shipping available Mon-Fri. Weekend delivery available in selected areas for additional $10.',
    keywords: ['express', 'overnight', 'fast', 'expedited', 'rush'],
    category: 'shipping',
    frequency: 85
  },
  {
    id: 'shipping_005',
    question: 'How do I track my order?',
    answer: 'Once shipped, you receive tracking number via email. Click the link to track real-time location. Tracking updates every 4-6 hours. If tracking not updating for 24+ hours, contact support. Some international orders take 48 hours to show tracking data.',
    keywords: ['track', 'tracking', 'status', 'location', 'update'],
    category: 'shipping',
    frequency: 90
  },
  {
    id: 'shipping_006',
    question: 'What if my order does not arrive?',
    answer: 'If not received within stated timeframe: 1. Check with neighbors/family, 2. Verify tracking shows delivery, 3. Wait 2 additional days, 4. Contact support with order ID and address. We offer full refund or replacement within 30 days.',
    keywords: ['missing', 'lost', 'arrive', 'not', 'received'],
    category: 'shipping',
    frequency: 82
  },
  {
    id: 'shipping_007',
    question: 'Is free shipping available?',
    answer: 'Free standard shipping available on orders over $50. Minimum order value $15 for paid shipping. We occasionally offer free shipping promotions via email newsletter. Subscribe to receive promotional codes.',
    keywords: ['free', 'shipping', 'no cost', 'promotional'],
    category: 'shipping',
    frequency: 87
  },
  {
    id: 'shipping_008',
    question: 'Do you ship internationally?',
    answer: 'We ship to 50+ countries including Canada, UK, Europe, Australia, and Asia. International shipping costs $20-80 depending on destination. Customs fees may apply - buyer responsible. Delivery typically 10-21 business days.',
    keywords: ['international', 'overseas', 'country', 'global', 'worldwide'],
    category: 'shipping',
    frequency: 79
  },
  {
    id: 'shipping_009',
    question: 'What payment methods do you accept?',
    answer: 'Accepted payment methods: credit cards (Visa, Mastercard, Amex), debit cards, PayPal, Apple Pay, Google Pay, bank transfers. All payments processed securely with SSL encryption. No payment info stored on servers.',
    keywords: ['payment', 'credit', 'card', 'method', 'accept'],
    category: 'shipping',
    frequency: 94
  },
  {
    id: 'shipping_010',
    question: 'Can I split my order into multiple shipments?',
    answer: 'Orders typically ship as one package for efficiency. If items unavailable, we may split shipment at no charge. Request splitting before checkout. Multiple shipments may incur additional $5 fee per shipment.',
    keywords: ['split', 'shipment', 'multiple', 'package'],
    category: 'shipping',
    frequency: 65
  },
  {
    id: 'shipping_011',
    question: 'How do I arrange a return shipment?',
    answer: 'Return process: 1. Contact support within 30 days of delivery, 2. Receive prepaid return label via email, 3. Pack item and attach label, 4. Drop off at carrier location, 5. Refund processed within 5 business days of receiving return. Original shipping non-refundable.',
    keywords: ['return', 'shipment', 'refund', 'exchange'],
    category: 'shipping',
    frequency: 88
  },
  {
    id: 'shipping_012',
    question: 'What about package damage?',
    answer: 'For damaged packages: 1. Photograph damage and contents, 2. Do not dispose items, 3. Contact support within 48 hours with photos, 4. Provide order ID and damage description. We arrange replacement shipment or full refund.',
    keywords: ['damage', 'broken', 'defective', 'package'],
    category: 'shipping',
    frequency: 81
  },
  {
    id: 'shipping_013',
    question: 'Is gift wrapping available?',
    answer: 'Gift wrapping service available for $5 per item. Service includes: themed wrapping paper, gift ribbon, personalized gift card (optional). Estimated gift wrap processing adds 1-2 business days to delivery time.',
    keywords: ['gift', 'wrap', 'wrapping', 'present'],
    category: 'shipping',
    frequency: 58
  },
  {
    id: 'shipping_014',
    question: 'Do you hold orders for pickup?',
    answer: 'Store pickup available at 15 locations. Orders held for 7 days. Notify us at checkout for pickup option. Local tax may apply. No shipping cost charged for pickup orders. Pickup hours: Mon-Sat 9am-6pm, Sun 11am-5pm.',
    keywords: ['pickup', 'store', 'hold', 'location'],
    category: 'shipping',
    frequency: 72
  },
  {
    id: 'shipping_015',
    question: 'Can I upgrade or downgrade shipping after purchase?',
    answer: 'Shipping method changes allowed within 12 hours of purchase (before warehouse processing). Submit request via support portal. Upgrade surcharge due immediately. Downgrade refunded to original payment method within 3 business days.',
    keywords: ['upgrade', 'downgrade', 'change', 'modify', 'shipping'],
    category: 'shipping',
    frequency: 76
  },
  {
    id: 'shipping_016',
    question: 'What is your delivery guarantee?',
    answer: 'Delivery guaranteed by promised date or first month credit issued. Credits issued for legitimate delays (weather, carrier issues excluded). Guarantee applies to standard shipping only. Emergency circumstances may delay delivery without recourse.',
    keywords: ['guarantee', 'promise', 'deadline', 'delivery'],
    category: 'shipping',
    frequency: 74
  },
  {
    id: 'shipping_017',
    question: 'How do address corrections work?',
    answer: 'Address corrections must be submitted within 2 hours of order. System attempts delivery at corrected address. If correction submitted after 2 hours, original address used. Redelivery to corrected address costs $10 if carrier permits.',
    keywords: ['address', 'correction', 'fix', 'update'],
    category: 'shipping',
    frequency: 68
  },
  {
    id: 'shipping_018',
    question: 'Are signature services available?',
    answer: 'Signature confirmation available for high-value orders ($500+) automatically. Optional signature service adds $8. Required for insurance claims. Adult signature required for certain products. Buyer must be home for delivery.',
    keywords: ['signature', 'confirmation', 'required', 'delivery'],
    category: 'shipping',
    frequency: 71
  },
  {
    id: 'shipping_019',
    question: 'What about holiday shipping?',
    answer: 'Holiday shipping deadlines: Christmas (Dec 18), New Year (Dec 23), Easter (April 15). Orders after deadline shipped after holiday. Holiday surcharge: $5. Extended processing time 3-5 business days. Holiday returns accepted until January 31.',
    keywords: ['holiday', 'christmas', 'new year', 'special', 'deadline'],
    category: 'shipping',
    frequency: 83
  },
  {
    id: 'shipping_020',
    question: 'Do you ship to PO boxes?',
    answer: 'Standard shipping to PO boxes available (5-7 days). Express/overnight shipping NOT available to PO boxes. Some restrictions apply depending on carrier. Provide complete PO box number in format: PO Box [number], [city], [state], [zip].',
    keywords: ['box', 'shipping', 'address'],
    category: 'shipping',
    frequency: 69
  },

  // ========== Billing Category (15 FAQs) ==========
  {
    id: 'billing_001',
    question: 'Why was I charged twice?',
    answer: 'Duplicate charges usually temporary authorization holds. Banks typically release within 3-5 business days. If charge remains after 5 days, contact support immediately. We investigate duplicate charges within 48 hours and issue refund if error confirmed. Do not dispute until contacting us first.',
    keywords: ['charge', 'twice', 'duplicate', 'billed'],
    category: 'billing',
    frequency: 91
  },
  {
    id: 'billing_002',
    question: 'Can I get an invoice?',
    answer: 'Invoices emailed automatically after purchase completion. Invoice includes: order number, items, quantities, prices, shipping, taxes, total. Download from account dashboard anytime. Tax invoices available for business customers with valid tax ID.',
    keywords: ['invoice', 'receipt', 'bill', 'document'],
    category: 'billing',
    frequency: 86
  },
  {
    id: 'billing_003',
    question: 'How do refunds work?',
    answer: 'Refunds processed within 5-7 business days of return acceptance. Original shipping non-refundable. Refund amount: item price - restocking fee (0-15% depending on condition). Expedited/overnight fees non-refundable. Refund issued to original payment method.',
    keywords: ['refund', 'money back', 'return'],
    category: 'billing',
    frequency: 89
  },
  {
    id: 'billing_004',
    question: 'Is tax included in the price?',
    answer: 'Prices displayed exclude sales tax. Tax calculated at checkout based on shipping address. Tax rates vary: CA 8.5%, NY 8%, TX 8.25%, etc. Tax included in final total shown before confirming purchase. Tax-exempt customers must provide tax ID.',
    keywords: ['tax', 'sales', 'included', 'price'],
    category: 'billing',
    frequency: 84
  },
  {
    id: 'billing_005',
    question: 'Do you offer payment plans?',
    answer: 'Payment plan options available through Affirm, Klarna, AfterPay for qualified purchases. 3-month interest-free plans available for orders $50+. Minimum monthly payment $15. Payment plan fees apply if payments missed. Select payment plan at checkout.',
    keywords: ['payment', 'plan', 'installment', 'financing'],
    category: 'billing',
    frequency: 77
  },
  {
    id: 'billing_006',
    question: 'What about transaction fees?',
    answer: 'No transaction fees charged to customers. We process payments through secure gateways with 3D Secure authentication. Bank may charge small processing fees for international purchases. Contact your bank for details on international transaction charges.',
    keywords: ['fee', 'transaction', 'charge', 'processing'],
    category: 'billing',
    frequency: 73
  },
  {
    id: 'billing_007',
    question: 'How do promotional codes work?',
    answer: 'Promotional codes applied at checkout before payment. Code must be valid and not expired. Codes non-stackable (one code per order). Some codes exclude certain products. Minimum order amounts may apply. Refund value does not include discount.',
    keywords: ['code', 'promo', 'discount', 'coupon'],
    category: 'billing',
    frequency: 90
  },
  {
    id: 'billing_008',
    question: 'Is there a student discount?',
    answer: 'Students receive 10% discount year-round. Verify student status through SheerID during checkout. Valid student email required. Discount applies to applicable products only. Limited to one discount per student per calendar year.',
    keywords: ['student', 'discount', 'education'],
    category: 'billing',
    frequency: 70
  },
  {
    id: 'billing_009',
    question: 'Do you offer bulk pricing?',
    answer: 'Bulk discounts available for orders 10+ units. Discount tiers: 10-25 units (5%), 25-50 units (10%), 50+ units (15%). Contact sales team for custom quotes. Bulk orders processed separately with extended delivery timelines.',
    keywords: ['bulk', 'quantity', 'discount', 'wholesale'],
    category: 'billing',
    frequency: 68
  },
  {
    id: 'billing_010',
    question: 'What is your price match guarantee?',
    answer: 'We match competitor prices if lower. Must provide valid competitor URL with current price. Price match valid for identical items. Excludes clearance, open-box, refurbished items. Submit price match request within 24 hours of purchase.',
    keywords: ['price', 'match', 'competitor', 'lower'],
    category: 'billing',
    frequency: 74
  },
  {
    id: 'billing_011',
    question: 'How do gift cards work?',
    answer: 'Digital gift cards emailed immediately upon purchase. No expiration date. Balance checked at checkout. Partial redemption allowed - remaining balance preserved. Physical gift cards shipped free in 1-2 business days. Non-transferable and non-refundable after purchase.',
    keywords: ['gift', 'card', 'balance', 'redeem'],
    category: 'billing',
    frequency: 79
  },
  {
    id: 'billing_012',
    question: 'Do you offer subscription discounts?',
    answer: 'Subscribe-and-save program offers 15% discount on auto-replenishment orders. Flexible scheduling: weekly, monthly, or custom intervals. Cancel anytime - no penalties. First order 20% off. Must have active subscription to maintain savings.',
    keywords: ['subscription', 'auto-replenishment', 'save', 'recurring'],
    category: 'billing',
    frequency: 76
  },
  {
    id: 'billing_013',
    question: 'What is the cancellation policy?',
    answer: 'Orders cancelled within 30 minutes receive full refund including shipping. After 30 minutes (if not shipped): $5 cancellation fee applies. After shipping: standard return policy applies. Return shipping paid by customer or deducted from refund.',
    keywords: ['cancel', 'cancellation', 'policy'],
    category: 'billing',
    frequency: 81
  },
  {
    id: 'billing_014',
    question: 'How do credit card disputes work?',
    answer: 'For billing disputes: 1. Contact us first to resolve, 2. We have 10 days to respond, 3. Disputes escalated to bank/card issuer, 4. Resolution within 60 days. Provide order number and dispute reason. We accept liability if error confirmed.',
    keywords: ['dispute', 'chargeback', 'claim', 'card'],
    category: 'billing',
    frequency: 72
  },
  {
    id: 'billing_015',
    question: 'Are late fees charged?',
    answer: 'Late fees apply only to payment plans. If payment missed: 15% late fee or $25 (whichever greater). Contact support before payment due date to arrange payment. Three missed payments may result in account suspension.',
    keywords: ['late', 'fee', 'overdue', 'payment'],
    category: 'billing',
    frequency: 67
  },

  // ========== Product Category (20 FAQs) ==========
  {
    id: 'product_001',
    question: 'What are the product dimensions?',
    answer: 'Dimensions listed on product page in inches and centimeters. Detailed measurements: width x depth x height. Weight provided in pounds/kilograms. Product packaging dimensions available in specifications tab. For custom measurements, contact support.',
    keywords: ['dimensions', 'size', 'measurement', 'specifications'],
    category: 'product',
    frequency: 88
  },
  {
    id: 'product_002',
    question: 'What materials are used?',
    answer: 'Material composition listed in product specifications. All materials safety-tested and certified. Hypoallergenic options available. Materials: fabric (100% organic cotton), metal (stainless steel), plastic (BPA-free). Care instructions on label.',
    keywords: ['material', 'fabric', 'composition', 'content'],
    category: 'product',
    frequency: 85
  },
  {
    id: 'product_003',
    question: 'Is the product eco-friendly?',
    answer: 'Many products made from sustainable materials. Recyclable packaging used. Carbon-neutral shipping available (+$2). Products certified by Green Seal or FSC standards. Eco-friendly range clearly marked. Detailed sustainability info in product descriptions.',
    keywords: ['eco', 'friendly', 'sustainable', 'green', 'recyclable'],
    category: 'product',
    frequency: 82
  },
  {
    id: 'product_004',
    question: 'What warranty is included?',
    answer: 'Standard warranty: 1 year manufacturer coverage. Extended warranty available (2-5 years) for additional $20-50. Warranty covers: defects, malfunctions, not damage from misuse. Claim process: contact support with proof of purchase and issue description. Warranty non-transferable.',
    keywords: ['warranty', 'coverage', 'guarantee', 'protection'],
    category: 'product',
    frequency: 87
  },
  {
    id: 'product_005',
    question: 'Is technical support available?',
    answer: 'Technical support available: phone (Mon-Fri 9am-6pm EST), email (24 hours), chat (Mon-Fri 10am-5pm EST). Support includes setup, troubleshooting, configuration. Response time: 2 hours email, immediate chat/phone. Premium support available with extended coverage.',
    keywords: ['support', 'technical', 'help', 'assistance'],
    category: 'product',
    frequency: 84
  },
  {
    id: 'product_006',
    question: 'What colors are available?',
    answer: 'Available colors displayed on product page with photos. Select color before adding to cart. Some colors may have limited stock. Color names standardized: Basic (black, white, gray), Vibrant (red, blue, green), Pastels (pink, mint, lavender). Exact color varies slightly per display.',
    keywords: ['color', 'available', 'choose', 'option'],
    category: 'product',
    frequency: 89
  },
  {
    id: 'product_007',
    question: 'Is there customer review information?',
    answer: 'Verified customer reviews displayed on product page. Average rating shown with breakdown (5-1 stars). Filter reviews by rating or date. Detailed reviews include photos/videos. We verify purchases and prevent fake reviews. Review submission takes 24 hours for moderation.',
    keywords: ['review', 'rating', 'customer', 'feedback'],
    category: 'product',
    frequency: 91
  },
  {
    id: 'product_008',
    question: 'What sizes are available?',
    answer: 'Available sizes vary by product type. Apparel: XS-3XL, shoes: 5-15, accessories: one-size. Size chart provided with measurement conversions (US, EU, UK). Size exchange free within 30 days if defect-free. Custom sizing available for orders 5+ units.',
    keywords: ['size', 'sizing', 'fit', 'available'],
    category: 'product',
    frequency: 86
  },
  {
    id: 'product_009',
    question: 'Is this item in stock?',
    answer: 'Stock status shown on product page: "In Stock" (ships immediately), "Low Stock" (5+ items), "Backordered" (ships within X days). Stock updates real-time. Out-of-stock items: reserve notification opt-in. Restock notifications sent via email when available.',
    keywords: ['stock', 'inventory', 'available', 'backorder'],
    category: 'product',
    frequency: 93
  },
  {
    id: 'product_010',
    question: 'How do I use the product?',
    answer: 'Usage instructions included with product. Detailed manual available for download on product page. Video tutorials available on YouTube channel. FAQs and troubleshooting for common questions. For detailed help, contact technical support.',
    keywords: ['use', 'usage', 'instructions', 'manual', 'guide'],
    category: 'product',
    frequency: 79
  },
  {
    id: 'product_011',
    question: 'Can I customize this product?',
    answer: 'Customization options available: engraving, monogramming, color combinations. Custom orders typically add 5-10 business days. Customized items non-returnable unless defective. Minimum customization orders: 1 item. Upload custom designs or select from templates.',
    keywords: ['custom', 'personalize', 'engrave', 'monogram'],
    category: 'product',
    frequency: 75
  },
  {
    id: 'product_012',
    question: 'What is the product lifespan?',
    answer: 'Typical lifespan: 3-5 years with normal use. Durability depends on maintenance and usage frequency. Replacement parts available for extended lifespan. Care instructions maximize longevity. Warranty covers defects but not normal wear and tear.',
    keywords: ['lifespan', 'durability', 'longevity', 'replacement'],
    category: 'product',
    frequency: 72
  },
  {
    id: 'product_013',
    question: 'Is assembly required?',
    answer: 'Some products require assembly. Assembly time: 15-60 minutes. Tools needed listed in manual. Video assembly tutorial available. Assembly service available in select areas ($50-100). Assembled delivery upon request for additional fee.',
    keywords: ['assembly', 'setup', 'installation', 'build'],
    category: 'product',
    frequency: 80
  },
  {
    id: 'product_014',
    question: 'What are storage recommendations?',
    answer: 'Storage conditions: room temperature (60-75F), dry location, away from sunlight. Specific storage by product type provided in manual. Long-term storage: protective covering recommended. Temperature/humidity extremes may affect product. Contact support for storage concerns.',
    keywords: ['storage', 'keep', 'condition', 'store'],
    category: 'product',
    frequency: 68
  },
  {
    id: 'product_015',
    question: 'Is the product safe for children?',
    answer: 'Child safety tested and certified. Small parts warning if applicable (age 3+). Age recommendations listed. Non-toxic materials used. No sharp edges or choking hazards. Product tested per CPSC standards. Parental supervision recommended for young children.',
    keywords: ['safe', 'children', 'kid', 'toy', 'age'],
    category: 'product',
    frequency: 81
  },
  {
    id: 'product_016',
    question: 'Can this be used outdoors?',
    answer: 'Outdoor-rated products marked as weather-resistant/waterproof. UV protection verified if applicable. Recommended outdoor conditions: temperature range -10 to 120F. Annual maintenance (cleaning, sealing) recommended. Damage from weather not covered by warranty.',
    keywords: ['outdoor', 'weather', 'waterproof', 'rain'],
    category: 'product',
    frequency: 77
  },
  {
    id: 'product_017',
    question: 'Is there a user manual available?',
    answer: 'User manual included with product and available for download. Multilingual manuals available (English, Spanish, French, German, Mandarin, etc.). Video manuals on YouTube. Contact support for PDF manual if needed. Manual updates available for software-enabled products.',
    keywords: ['manual', 'guide', 'instructions', 'documentation'],
    category: 'product',
    frequency: 76
  },
  {
    id: 'product_018',
    question: 'What does "as pictured" mean?',
    answer: 'Product appearance matches photos on listing. Photo colors may vary slightly from actual due to display differences. Models/props not included. Product packaging may differ from photos. Request additional photos via live chat if needed. Video demonstration available.',
    keywords: ['picture', 'photo', 'image', 'appearance'],
    category: 'product',
    frequency: 71
  },
  {
    id: 'product_019',
    question: 'Are compatible accessories included?',
    answer: 'Accessories included listed in product description. Standard accessories: power cable, carrying case, batteries (if applicable). Premium accessories sold separately. Compatibility verified at checkout. List of compatible products available on product page.',
    keywords: ['accessory', 'included', 'compatible', 'bundle'],
    category: 'product',
    frequency: 73
  },
  {
    id: 'product_020',
    question: 'What is the return reason for defects?',
    answer: 'Defective products replaceable within 30 days. Return process: 1. Contact support with issue, 2. Send photos/video proof, 3. Receive replacement/refund authorization, 4. Ship defective item back (prepaid), 5. Replacement shipped. Fast-track for defects within 14 days.',
    keywords: ['defect', 'problem', 'broken', 'faulty'],
    category: 'product',
    frequency: 85
  },

  // ========== Account Category (10 FAQs) ==========
  {
    id: 'account_001',
    question: 'How do I create an account?',
    answer: 'Sign up on homepage: provide email, password (8+ characters with uppercase/number/symbol). Or use Google/Facebook login. Email confirmation required. Account verified within 5 minutes. Optional: add profile picture, phone number, preferences.',
    keywords: ['account', 'create', 'sign up', 'register'],
    category: 'account',
    frequency: 92
  },
  {
    id: 'account_002',
    question: 'How do I reset my password?',
    answer: 'Click "Forgot Password" on login page. Enter email address. Reset link sent within 5 minutes. Link valid for 24 hours. Create new password (8+ characters with uppercase/number/symbol). Password updated immediately.',
    keywords: ['password', 'reset', 'forgot', 'change'],
    category: 'account',
    frequency: 94
  },
  {
    id: 'account_003',
    question: 'Can I link multiple cards?',
    answer: 'Yes, unlimited payment methods can be saved. Add cards in account settings > Payment Methods. Set default card for auto-checkout. Each card requires one-time verification (3D Secure). Old cards removable anytime. Saved cards encrypted and secure.',
    keywords: ['card', 'payment', 'method', 'link', 'add'],
    category: 'account',
    frequency: 87
  },
  {
    id: 'account_004',
    question: 'How do I update account information?',
    answer: 'Access Settings > Profile Information. Update: email, phone, address, preferences. Changes take effect immediately. Email change requires verification. Billing address updates reflect on next purchase. Contact support for sensitive account changes.',
    keywords: ['update', 'profile', 'information', 'edit', 'change'],
    category: 'account',
    frequency: 88
  },
  {
    id: 'account_005',
    question: 'What are privacy settings?',
    answer: 'Control data sharing in Settings > Privacy. Options: email marketing (on/off), SMS notifications (on/off), personalization (on/off), third-party analytics (on/off). Changes effective immediately. Privacy policy updated quarterly.',
    keywords: ['privacy', 'setting', 'data', 'share', 'marketing'],
    category: 'account',
    frequency: 81
  },
  {
    id: 'account_006',
    question: 'How do I delete my account?',
    answer: 'Request account deletion in Settings > Account > Delete Account. Confirmation email sent. Account deleted after 30-day review period. Data deletion permanent and irreversible. Active subscriptions cancelled. Pending orders still processed.',
    keywords: ['delete', 'account', 'close', 'remove'],
    category: 'account',
    frequency: 79
  },
  {
    id: 'account_007',
    question: 'Can I see my order history?',
    answer: 'Order history available in account dashboard. View: order date, status, items, totals, tracking. Download invoices anytime. Filter by date range or order status. Accounts retain history for 7 years. Guest purchases visible with email link.',
    keywords: ['history', 'order', 'previous', 'past'],
    category: 'account',
    frequency: 90
  },
  {
    id: 'account_008',
    question: 'How do I manage notifications?',
    answer: 'Customize notification preferences in Settings > Notifications. Choose: order updates (email/SMS/push), promotional offers, new products, reviews. Real-time notifications optional. Notification frequency adjustable. Do-not-contact list available.',
    keywords: ['notification', 'alert', 'update', 'message'],
    category: 'account',
    frequency: 84
  },
  {
    id: 'account_009',
    question: 'Is two-factor authentication available?',
    answer: '2FA optional security feature. Enable in Settings > Security. Methods: SMS code, authenticator app (Google/Authy), email. 2FA required for sensitive actions: password change, payment method update, billing address change. Backup codes provided.',
    keywords: ['authentication', '2fa', 'security', 'factor'],
    category: 'account',
    frequency: 76
  },
  {
    id: 'account_010',
    question: 'Can I have multiple addresses?',
    answer: 'Save unlimited addresses in Settings > Addresses. Label each (home, work, etc.). Select address at checkout. Set default shipping address. Edit/delete addresses anytime. Addresses retained indefinitely unless deleted.',
    keywords: ['address', 'multiple', 'save', 'location'],
    category: 'account',
    frequency: 82
  },

  // ========== Policy Category (10 FAQs) ==========
  {
    id: 'policy_001',
    question: 'What is the return policy?',
    answer: 'Returns accepted within 30 days of delivery. Items must be unused/unmodified with original packaging. Return shipping paid by customer (or deducted from refund). Restocking fee: 0-15% depending on product. Refunds processed within 5-7 business days.',
    keywords: ['return', 'policy', 'days', 'condition'],
    category: 'policy',
    frequency: 93
  },
  {
    id: 'policy_002',
    question: 'What is the privacy policy?',
    answer: 'Privacy policy details data collection, usage, and protection. We collect: account info, order history, browsing behavior. Data encrypted and secured. No data sold to third parties. Users control data via privacy settings. Full policy at footer link.',
    keywords: ['privacy', 'policy', 'data', 'collection'],
    category: 'policy',
    frequency: 88
  },
  {
    id: 'policy_003',
    question: 'What is the terms of service?',
    answer: 'Terms govern platform usage: user responsibilities, payment terms, dispute resolution, intellectual property. Service provided "as-is" without guarantees. We reserve right to modify terms (30 days notice). Continued use means acceptance. Full terms at footer.',
    keywords: ['terms', 'service', 'agreement', 'condition'],
    category: 'policy',
    frequency: 84
  },
  {
    id: 'policy_004',
    question: 'How are disputes resolved?',
    answer: 'Dispute resolution process: 1. Contact support within 30 days, 2. We respond within 48 hours, 3. Escalation to mediation if needed, 4. Final decision within 30 days. Most disputes resolved informally. Formal arbitration last resort.',
    keywords: ['dispute', 'resolution', 'conflict', 'claim'],
    category: 'policy',
    frequency: 79
  },
  {
    id: 'policy_005',
    question: 'What is your accessibility policy?',
    answer: 'Website complies with WCAG 2.1 AA standards. Accessibility features: keyboard navigation, screen reader support, text sizing, contrast options. Report accessibility issues to support@company.com. Ongoing improvements made quarterly.',
    keywords: ['accessibility', 'disability', 'wcag', 'access'],
    category: 'policy',
    frequency: 72
  },
  {
    id: 'policy_006',
    question: 'What is the anti-fraud policy?',
    answer: 'We employ fraud detection systems to prevent unauthorized transactions. Suspicious orders may require verification. Confirmed fraud: order cancelled, funds held 30 days, account may be suspended. Chargeback disputes investigated.',
    keywords: ['fraud', 'protection', 'security', 'suspicious'],
    category: 'policy',
    frequency: 80
  },
  {
    id: 'policy_007',
    question: 'What is your data retention policy?',
    answer: 'Account data retained until deletion requested. Transaction data: 7 years (tax compliance). Backup data: 30 days. Personal data deletion request honored within 30 days. Limited data retained for legal/dispute purposes.',
    keywords: ['data', 'retention', 'keep', 'delete'],
    category: 'policy',
    frequency: 75
  },
  {
    id: 'policy_008',
    question: 'What about cookies and tracking?',
    answer: 'Cookies used for: session management, preferences, analytics. Third-party trackers optional (can be disabled). Users control cookies via browser settings. Cookie policy details at footer. No tracking if Do-Not-Track enabled.',
    keywords: ['cookie', 'tracking', 'analytics', 'data'],
    category: 'policy',
    frequency: 74
  },
  {
    id: 'policy_009',
    question: 'Is there a code of conduct?',
    answer: 'Users must comply with code: no illegal activity, no harassment, no spam. Violations result in account suspension or ban. Report violations to support@company.com. First offense: warning. Repeated: permanent ban.',
    keywords: ['conduct', 'code', 'behavior', 'rule'],
    category: 'policy',
    frequency: 68
  },
  {
    id: 'policy_010',
    question: 'What is the liability disclaimer?',
    answer: 'Company liability limited to refund amount. We are not liable for: indirect damages, lost profits, service interruptions (except gross negligence). Some jurisdictions do not allow limitation. Insurance available for high-value purchases.',
    keywords: ['liability', 'disclaimer', 'limit', 'risk'],
    category: 'policy',
    frequency: 70
  }
];

export default FAQ_DATABASE;
