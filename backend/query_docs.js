const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  try {
    // Get all documents
    const allDocs = await prisma.document.findMany();
    console.log(`\n✅ Total documents in database: ${allDocs.length}\n`);

    // Group by source
    const bySource = {};
    allDocs.forEach(doc => {
      bySource[doc.source] = (bySource[doc.source] || 0) + 1;
    });
    
    console.log("Documents by source:");
    Object.entries(bySource).forEach(([source, count]) => {
      console.log(`  - ${source}: ${count} docs`);
    });

    // Find shipping related docs
    const shippingDocs = allDocs.filter(doc => 
      doc.title.toLowerCase().includes("shipping") || 
      doc.title.toLowerCase().includes("delivery") ||
      doc.title.toLowerCase().includes("track")
    );
    console.log(`\n📦 Shipping/Delivery related docs: ${shippingDocs.length}`);
    shippingDocs.forEach(doc => console.log(`  - ${doc.title}`));

    // Find account security docs
    const securityDocs = allDocs.filter(doc => 
      doc.title.toLowerCase().includes("password") ||
      doc.title.toLowerCase().includes("account") ||
      doc.title.toLowerCase().includes("security") ||
      doc.title.toLowerCase().includes("login") ||
      doc.title.toLowerCase().includes("authentication")
    );
    console.log(`\n🔒 Account/Security related docs: ${securityDocs.length}`);
    securityDocs.forEach(doc => console.log(`  - ${doc.title}`));

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
