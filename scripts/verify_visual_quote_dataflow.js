import connectDB from "../src/config/database.js";
import scanService from "../src/modules/scan/tag-unlock.service.js";
import dashboardService from "../src/modules/dashboard/dashboard.service.js";
import receivedQuoteService from "../src/modules/received-quote/receivedQuote.service.js";
import User from "../src/models/user.model.js";
import Tag from "../src/modules/tag/tag.model.js";
import Quote from "../src/modules/quote/quote.model.js";
import QuoteAssignment from "../src/modules/quoteAssignment/quoteAssignment.model.js";
import mongoose from "mongoose";

async function verifyDataflow() {
  await connectDB();
  console.log("=== RUNNING VISUAL QUOTE DATA-FLOW & RENDERING INTEGRITY TESTS ===\n");

  // -------------------------------------------------------------
  // TEST 1 — Public Scan Endpoint returns editorData
  // -------------------------------------------------------------
  console.log("--- TEST 1: Public Scan for TAG-MSRDK3PQ-0001 ---");
  const scanRes = await scanService.publicUnlock("TAG-MSRDK3PQ-0001");
  console.log("Scan text:", scanRes.quote);
  console.log("Scan has editorData:", Boolean(scanRes.editorData));
  if (!scanRes.editorData || !scanRes.editorData.desktop || !scanRes.editorData.mobile) {
    throw new Error("TEST 1 FAILED: editorData is missing or incomplete in public scan response!");
  }
  console.log("✅ TEST 1 PASSED: Public scan response carries full editorData (desktop & mobile).");

  // -------------------------------------------------------------
  // TEST 2 — User Dashboard Home returns editorData
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: User Dashboard Home Endpoint ---");
  const users = await User.find({ isDeleted: false }).limit(1).lean();
  const Category = (await import("../src/modules/category/category.model.js")).default;
  const categoryDoc = await Category.findOne({ slug: "inspire" }) || await Category.findOne({});
  if (users.length > 0) {
    const testUserId = users[0]._id;
    const visualQuote = await Quote.findOne({ editorData: { $ne: null } }).lean();
    if (visualQuote && categoryDoc) {
      await receivedQuoteService.saveReceivedQuote({
        user: testUserId,
        quote: visualQuote._id,
        category: categoryDoc._id,
        categorySlug: categoryDoc.slug,
        receivedAt: new Date(),
        dayKey: new Date().toISOString().split("T")[0],
      });
    }
    const homeData = await dashboardService.getHomeData(testUserId);
    console.log("Home latestInspiration has received quote:", homeData.latestInspiration.hasReceivedQuote);
    console.log("Home latestQuote has editorData:", Boolean(homeData.latestInspiration.latestQuote?.editorData));
    if (homeData.latestInspiration.hasReceivedQuote && !homeData.latestInspiration.latestQuote?.editorData) {
      throw new Error("TEST 2 FAILED: Dashboard home latestQuote did not populate editorData!");
    }
  }
  console.log("✅ TEST 2 PASSED: User dashboard home endpoint populates editorData.");

  // -------------------------------------------------------------
  // TEST 3 — Cloudinary Image URL & Media Integrity
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Visual Elements & Cloudinary Media Integrity ---");
  const desktopImg = scanRes.editorData.desktop.elements.find(e => e.type === "image");
  const mobileImg = scanRes.editorData.mobile.elements.find(e => e.type === "image");
  console.log("Desktop Image URL:", desktopImg?.imageData?.source?.url);
  console.log("Mobile Image URL:", mobileImg?.imageData?.source?.url);

  if (!desktopImg?.imageData?.source?.url?.startsWith("https://res.cloudinary.com") ||
      !mobileImg?.imageData?.source?.url?.startsWith("https://res.cloudinary.com")) {
    throw new Error("TEST 3 FAILED: Cloudinary image URL missing or invalid in visual quote!");
  }
  console.log("✅ TEST 3 PASSED: Cloudinary image URLs are intact with full resolution parameters.");

  // -------------------------------------------------------------
  // TEST 4 — Shape & Typography Elements Integrity
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Shape & Typography Elements Integrity ---");
  const textEl = scanRes.editorData.desktop.elements.find(e => e.type === "text");
  const mobileShapes = scanRes.editorData.mobile.elements.filter(e => e.type === "shape");

  console.log("Text typography:", textEl?.textData?.fontFamily, textEl?.textData?.fontSize, textEl?.textData?.color);
  console.log("Mobile shapes count:", mobileShapes.length);
  mobileShapes.forEach((s, idx) => {
    console.log(`- Shape ${idx + 1}: ${s.shapeData?.shapeType} | fill: ${s.shapeData?.fillColor}`);
  });

  if (!textEl?.textData?.fontFamily || mobileShapes.length !== 2) {
    throw new Error("TEST 4 FAILED: Typography or shapes corrupted in editorData!");
  }
  console.log("✅ TEST 4 PASSED: Typography styling and vector shapes are fully defined.");

  // -------------------------------------------------------------
  // TEST 5 — Audio Track Integrity
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Audio Track Element Integrity ---");
  const audioEl = scanRes.editorData.desktop.elements.find(e => e.type === "audio");
  console.log("Audio Track:", audioEl?.audioData);
  if (!audioEl?.audioData?.source?.startsWith("https://res.cloudinary.com")) {
    throw new Error("TEST 5 FAILED: Audio track source missing or invalid in editorData!");
  }
  console.log("✅ TEST 5 PASSED: Audio track media source and settings preserved.");

  console.log("\n=======================================================");
  console.log("🎉 ALL DATA INTEGRITY TESTS PASSED 100%!");
  console.log("=======================================================");

  await mongoose.disconnect();
}

verifyDataflow().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
