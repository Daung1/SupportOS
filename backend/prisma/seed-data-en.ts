/**
 * Test Data Generation - E-commerce Customer Service Scenario
 * Knowledge Base: 20+ documents across multiple categories
 * Tickets: Sample customer inquiries
 */

// ============ Knowledge Base Data ============

export const knowledgeBaseData = {
  returnRefundPolicy: [
    { 
      title: "How to Return a Defective Product",
      content: "If you receive a defective product, you can return it within 30 days of purchase. Follow these steps: 1) Contact our support team with your order number 2) Provide photos of the defect 3) We will provide a return shipping label 4) Ship the product back to us 5) Once received, we will issue a full refund or replacement",
      source: "FAQ"
    },
    {
      title: "Product Warranty and Defect Coverage",
      content: "All our products come with a 1-year manufacturer warranty covering defects in materials and workmanship. If your product has a defect, we will repair or replace it at no cost. Simply contact support with proof of purchase and a description of the issue.",
      source: "Warranty"
    },
    {
      title: "Return Policy",
      content: "We offer a 30-day money-back guarantee on all products. If you are not satisfied for any reason, including receiving a defective item, contact our customer service team to initiate a return. No questions asked refunds are available within this period.",
      source: "Returns & Refunds"
    },
    {
      title: "Refund Process",
      content: "Once we receive your returned product, we will inspect it and process your refund within 5-7 business days. Refunds are issued to the original payment method. For defective items, we may also offer expedited replacement instead of refund.",
      source: "Returns & Refunds"
    },
    {
      title: "Damaged or Broken Item on Arrival",
      content: "If your item arrived damaged or broken, do not worry. We will replace it or issue a full refund immediately. Please contact us within 48 hours of delivery with photos of the damage. We will send a replacement or process your refund right away.",
      source: "Shipping Issues"
    },
    {
      title: "Return Conditions and Requirements",
      content: "Return Requirements: 1) Within 30 days of purchase 2) Product in original condition 3) Include original packaging 4) All accessories included 5) Original receipt or order number required",
      source: "Return Policy"
    },
    {
      title: "Exchange Process",
      content: "Product has an issue? Direct exchange available: 1) Submit exchange request 2) Describe issue and upload photos 3) We review and approve 4) Ship out replacement 5) Return original after confirming receipt of new item",
      source: "Exchange Policy"
    },
    {
      title: "Refund Methods",
      content: "Supported refund methods: 1) Original payment method - Credit/Debit Card (2-3 business days), PayPal (1-2 days), Apple Pay (1-2 days) 2) Store credit (instant)",
      source: "Refund Options"
    },
    {
      title: "No Return Accepted Cases",
      content: "We cannot accept returns for: 1) Products showing signs of use 2) Damaged or worn items 3) Missing accessories 4) Beyond 30-day return window 5) Items damaged due to customer misuse",
      source: "Return Exceptions"
    },
    {
      title: "Return Shipping Costs",
      content: "Shipping responsibility: For quality issues - we cover return shipping. For customer-initiated returns - customer pays. Standard return shipping cost: $8-20 depending on location",
      source: "Shipping Costs"
    },
    {
      title: "Return Timeline",
      content: "Return Timeline: Day 1) Ship item back with tracking Day 2-3) We receive and inspect Day 4-6) Approval and refund processing Day 7-10) Refund appears in your account. Total: 7-10 business days",
      source: "Refund Timeline"
    },
    {
      title: "International Returns",
      content: "For items purchased internationally: Contact international customer service for return authorization. International shipping costs apply. Return processing may take 2-4 weeks",
      source: "International Returns"
    },
    {
      title: "Satisfaction Guarantee",
      content: "Not satisfied? No questions asked return policy: Within 7 days, return unused items in original packaging. Customer pays return shipping. Full refund issued after inspection",
      source: "Satisfaction Guarantee"
    },
    {
      title: "Return Dispute Resolution",
      content: "Having issues with your return? 1) Contact customer service 2) Provide order number and evidence 3) We respond within 24-48 hours 4) Can escalate to management. Support: 1-800-123-4567",
      source: "Dispute Resolution"
    },
    {
      title: "Bulk and Business Returns",
      content: "Business customer returns: Available with business account. Simplified return process. 3-5 day refund timeline. Dedicated customer service support",
      source: "Business Returns"
    },
  ],

  shippingGuide: [
    {
      title: "Shipping Options Available",
      content: "Delivery methods: 1) Standard Shipping (5-7 days) - FREE 2) Express Shipping (2-3 days) - $15.99 3) Overnight Shipping (1 day) - $29.99 4) Local Pickup (1-2 days) - $5.00",
      source: "Delivery Options"
    },
    {
      title: "Track Your Package",
      content: "How to track your order: 1) Go to 'My Orders' 2) Find the order 3) Click 'Track Package' 4) View real-time location updates. SMS notifications sent at key delivery milestones",
      source: "Package Tracking"
    },
    {
      title: "Delayed Shipping - Common Reasons",
      content: "Why is my package delayed? 1) Weather conditions - snow, heavy rain 2) Holiday peak season 3) Remote delivery location 4) Recipient not available 5) Address clarification needed",
      source: "Delay Reasons"
    },
    {
      title: "Shipping Delivery Confirmation",
      content: "Upon delivery: Recipient or authorized person must sign. Verify package integrity. Check all items and accessories. Keep order number and receipt",
      source: "Delivery Confirmation"
    },
    {
      title: "Change Shipping Address",
      content: "Need to change your address? Before shipping: Log into account > Orders > Change Address. After shipping: Contact carrier directly. Already delivered: Submit new order",
      source: "Address Changes"
    },
    {
      title: "Refuse Package Delivery",
      content: "Product has issues? You can refuse delivery: 1) Tell carrier 'Refuse Delivery' 2) Note reason for refusal 3) Contact support immediately 4) Automatic refund in 1-3 days",
      source: "Refusal Policy"
    },
    {
      title: "Local Pickup Locations",
      content: "Nearby pickup locations: Log into account > Orders > Select Pickup. Find nearest store. Hours typically 10:00 AM - 8:00 PM",
      source: "Pickup Locations"
    },
    {
      title: "Remote Area Shipping",
      content: "Remote locations: Alaska, Hawaii, US territories have additional fees ($20-40). Processing time may be 10-15 business days for very remote areas",
      source: "Remote Areas"
    },
    {
      title: "Package Damaged After Delivery",
      content: "Received damaged product? 1) Report within 7 days 2) Take photos of damage 3) Keep original packaging 4) Submit claim for replacement or refund. Otherwise considered customer negligence",
      source: "Damage Claims"
    },
    {
      title: "Shipping Insurance Options",
      content: "Shipping insurance: Costs 0.5% of item value. Example: $1000 item = $5 insurance. Insured items reimbursed if lost. Recommended for high-value purchases",
      source: "Insurance Option"
    },
    {
      title: "Late Delivery Compensation",
      content: "Late delivery refunds: 1-3 days late = $5 credit. 4-7 days late = $10 credit. 7+ days late = $20 credit. Must request compensation - auto refund not available",
      source: "Late Compensation"
    },
    {
      title: "International Shipping",
      content: "International delivery times: USA-UK (5-8 days), USA-Europe (10-14 days), USA-Asia (8-12 days), USA-Australia (12-16 days). Fees calculated by weight",
      source: "International Shipping"
    },
    {
      title: "Lost Package Handling",
      content: "Package lost in transit? 1) Contact carrier 2) File lost package report 3) Carrier investigates (3-5 days) 4) If confirmed, insurance reimburses. Insured items: full value. Uninsured: negotiation",
      source: "Lost Package"
    },
    {
      title: "Holiday Shipping Schedule",
      content: "Holiday shipping: Christmas (Dec 24-Jan 2 closed), Thanksgiving (Nov 23-26 closed), Resumes next business day. Otherwise standard service. Consider delays during holiday season",
      source: "Holiday Shipping"
    },
    {
      title: "Return Shipping Process",
      content: "Return shipping: 1) Get return authorization number 2) Pack item securely 3) Use provided return label 4) Take to carrier or ship via post office 5) Track return shipment. Refund issued after inspection",
      source: "Return Shipping"
    },
  ],

  productInfo: [
    {
      title: "Product Specifications",
      content: "Detailed specifications available for all products. Technical data, dimensions, weight, materials, and performance metrics provided on product pages. Comparison tool available for similar items",
      source: "Product Details"
    },
    {
      title: "Product Quality Standards",
      content: "All products meet or exceed industry standards. Quality testing performed before shipment. Materials sourced from certified suppliers. Environmental and safety certifications verified",
      source: "Quality Assurance"
    },
    {
      title: "Warranty Information",
      content: "Standard 1-year manufacturer warranty on all products. Covers manufacturing defects and workmanship issues. Does not cover user damage, misuse, or accidents",
      source: "Product Warranty"
    },
    {
      title: "Product Compatibility",
      content: "Compatibility information listed on product page. Compatible devices listed. Accessories verified for fit. Customer reviews may mention compatibility issues",
      source: "Compatibility"
    },
    {
      title: "Safety and Certifications",
      content: "Products certified by: FCC, UL, CE, RoHS, CPSC. Safety data sheets available. All testing documentation provided. Environmental compliance verified",
      source: "Certifications"
    },
  ],

  accountSecurity: [
    {
      title: "Password Reset Instructions",
      content: "Forgot your password? 1) Go to login page 2) Click 'Forgot Password' 3) Enter registered email 4) Check email for verification code 5) Create new password 6) Confirm reset complete",
      source: "Password Recovery"
    },
    {
      title: "Two-Factor Authentication Setup",
      content: "Enable two-factor authentication: 1) Account Security settings 2) Choose authentication method (SMS, Email, or Authenticator app) 3) Verify 4) Save recovery codes in safe place",
      source: "2FA Setup"
    },
    {
      title: "Login Security Alerts",
      content: "Security notifications: 1) New device login alerts 2) Unusual location login warnings 3) Multiple failed login attempts 4) Change password immediately if suspicious",
      source: "Login Security"
    },
    {
      title: "Suspicious Activity - What to Do",
      content: "If suspicious activity detected: 1) Change password immediately 2) Review login history 3) Check recent orders 4) Contact support if unauthorized transactions 5) File fraud claim if needed",
      source: "Fraud Prevention"
    },
    {
      title: "Account Privacy Controls",
      content: "Privacy settings available: Shopping history (private), Wishlist (hidden), Addresses (partial), Orders (private), Review avatar (optional)",
      source: "Privacy Settings"
    },
  ],
};

// Generate complete knowledge base documents
export function generateKnowledgeBaseDocuments() {
  const documents: any[] = [];

  Object.entries(knowledgeBaseData).forEach(([category, docs]) => {
    docs.forEach((doc: any) => {
      documents.push({
        title: doc.title,
        content: doc.content,
        source: doc.source,
        similarity: Math.random() * 0.3 + 0.7,
      });
    });
  });

  return documents;
}

// ============ Ticket Samples ============

export const ticketSamples = {
  shipping: [
    "My order has been in transit for 2 weeks now, can you check the status?",
    "Why is my package stuck in the distribution center?",
    "The carrier says delivery failed, what does this mean?",
    "Can I change my delivery address before it arrives?",
    "Can I specify a delivery time window?",
    "Package has been at the local facility for 3 days, is it lost?",
    "Can you expedite my delivery?",
    "Shows delivered but I did not receive it",
    "Can I pick up at a local store instead?",
    "When will my package arrive?",
  ],
  return: [
    "Received a defective product, want to return it. Still within 30 days?",
    "Product not as described, how do I return it? How long for refund?",
    "Product arrived broken, what do I need to do? Need video proof?",
    "Can I exchange instead of return for refund?",
    "Can I return just one item from my order?",
    "I returned my item, where is my refund?",
    "What is my return tracking number?",
    "Can you speed up my return process?",
    "Product quality is poor, want to return it",
    "Want full refund for defective item",
  ],
  account: [
    "I forgot my password, how do I reset it?",
    "How do I enable two-factor authentication?",
    "I see a suspicious login on my account",
    "How do I change my email address?",
    "Can I delete my account?",
    "How do I view my login history?",
    "Someone accessed my account, help!",
    "How do I update my payment method?",
    "Can I merge two accounts?",
    "Where is my password reset email?",
  ],
  general: [
    "Do you have this item in a different color?",
    "What is the return policy?",
    "How long does shipping take?",
    "Do you offer student discounts?",
    "Can I get free shipping?",
    "What payment methods do you accept?",
    "Is there a loyalty program?",
    "How do I contact customer service?",
    "Do you have physical stores?",
    "What is your contact information?",
  ],
};

// Generate ticket samples
export function generateTicketSamples() {
  const tickets: any[] = [];

  Object.values(ticketSamples).forEach((categoryTickets: any[]) => {
    categoryTickets.forEach((ticket) => {
      tickets.push({
        content: ticket,
        priority: Math.random() > 0.7 ? "high" : "medium",
      });
    });
  });

  return tickets;
}
