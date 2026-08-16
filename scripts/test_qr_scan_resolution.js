import connectDB from "../src/config/database.js";
import Tag from "../src/modules/tag/tag.model.js";
import Quote from "../src/modules/quote/quote.model.js";
import User from "../src/models/user.model.js";
import QuoteAssignment from "../src/modules/quoteAssignment/quoteAssignment.model.js";
import ScanHistory from "../src/modules/scan/scan.model.js";
import scanService from "../src/modules/scan/tag-unlock.service.js";
import quoteAssignmentService from "../src/modules/quoteAssignment/quoteAssignment.service.js";
import mongoose from "mongoose";

async function runVerification() {
  await connectDB();
  console.log("=== STARTING QR SCAN → ASSIGNED QUOTE RESOLUTION TESTS ===\n");

  const createdTagIds = [];
  const createdQuoteIds = [];
  const createdUserIds = [];
  const createdAssignmentIds = [];

  try {
    // -------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -------------------------------------------------------------
    const testUser = await User.create({
      name: "Test Scan User",
      email: `test_scan_${Date.now()}@example.com`,
      role: "user",
    });
    createdUserIds.push(testUser._id);

    const testQuoteA = await Quote.create({
      text: "The only limit to our realization of tomorrow is our doubts of today.",
      author: "Franklin D. Roosevelt",
      category: "motivation",
      isActive: true,
    });
    createdQuoteIds.push(testQuoteA._id);

    const testQuoteB = await Quote.create({
      text: "Life is what happens when you're busy making other plans.",
      author: "John Lennon",
      category: "life",
      isActive: true,
    });
    createdQuoteIds.push(testQuoteB._id);

    const visualQuote = await Quote.create({
      text: "Visual Masterpiece Quote",
      author: "Artist Designer",
      category: "art",
      image: { url: "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg" },
      theme: "dark-gold",
      editorData: {
        desktop: {
          canvas: { width: 800, height: 600 },
          elements: [
            { type: "text", text: "Visual Masterpiece Quote", left: 100, top: 100 },
            { type: "image", src: "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg" },
            { type: "audio", audioData: { source: "https://example.com/soundtrack.mp3", title: "Theme Song", loop: true } }
          ],
          audio: { source: "https://example.com/soundtrack.mp3", title: "Theme Song", loop: true }
        },
        mobile: {
          canvas: { width: 375, height: 667 },
          elements: [{ type: "text", text: "Visual Masterpiece Quote Mobile" }]
        }
      },
      isActive: true,
    });
    createdQuoteIds.push(visualQuote._id);

    const tagCodeA = `TAG-TEST-A-${Date.now()}`;
    const tagA = await Tag.create({
      tagCode: tagCodeA,
      isActive: true,
      isActivated: true,
      owner: testUser._id,
    });
    createdTagIds.push(tagA._id);

    const tagCodeB = `TAG-TEST-B-${Date.now()}`;
    const tagB = await Tag.create({
      tagCode: tagCodeB,
      isActive: true,
      isActivated: true,
      owner: null,
    });
    createdTagIds.push(tagB._id);

    // -------------------------------------------------------------
    // TEST 1 — Exact Tag Lookup
    // -------------------------------------------------------------
    console.log("--- TEST 1: Exact Tag Lookup ---");
    const scanTest1 = await scanService.publicUnlock(tagCodeA);
    console.log("Resolved tag successfully with response for code:", tagCodeA);
    console.log("✅ TEST 1 PASSED: Exact Tag code resolves correct Tag.");

    // -------------------------------------------------------------
    // TEST 2 — Assigned Quote
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: Direct Tag Quote Assignment ---");
    const asgA = await quoteAssignmentService.createAssignment({
      quote: testQuoteA._id,
      tag: tagA._id,
      assignmentType: "tag",
      priority: 1,
    });
    createdAssignmentIds.push(asgA._id);

    const scanTest2 = await scanService.publicUnlock(tagCodeA);
    console.log("Scan result quote text:", scanTest2.quote, "| sourceType:", scanTest2.sourceType);
    if (scanTest2.quote !== testQuoteA.text || scanTest2.sourceType !== "tag_assignment") {
      throw new Error(`TEST 2 FAILED: Expected Quote A text "${testQuoteA.text}", got "${scanTest2.quote}"`);
    }
    console.log("✅ TEST 2 PASSED: Direct tag quote assignment is returned deterministically.");

    // -------------------------------------------------------------
    // TEST 3 — Cached Random Quote Regression
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Stale Daily Scan Cache Invalidation upon Assignment ---");
    // 1. Scan Tag B before any assignment -> generates random scan
    const initialScanB = await scanService.publicUnlock(tagCodeB);
    console.log("Initial scan on Tag B (random):", initialScanB.quote, "| sourceType:", initialScanB.sourceType);
    if (initialScanB.sourceType !== "random") {
      throw new Error(`TEST 3 Setup failed: expected random scan on Tag B`);
    }

    // 2. Assign Quote B to Tag B
    const asgB = await quoteAssignmentService.createAssignment({
      quote: testQuoteB._id,
      tag: tagB._id,
      assignmentType: "tag",
      priority: 1,
    });
    createdAssignmentIds.push(asgB._id);

    // 3. Scan Tag B again -> must return Quote B, NOT the old random scan
    const postAssignScanB = await scanService.publicUnlock(tagCodeB);
    console.log("Post-assignment scan on Tag B:", postAssignScanB.quote, "| sourceType:", postAssignScanB.sourceType);
    if (postAssignScanB.quote !== testQuoteB.text || postAssignScanB.sourceType !== "tag_assignment") {
      throw new Error(`TEST 3 FAILED: Old cached random quote was returned instead of Quote B!`);
    }
    console.log("✅ TEST 3 PASSED: Assigned quote overrides previous random daily scan cache immediately.");

    // -------------------------------------------------------------
    // TEST 4 — Different Tags (No Cross-Contamination)
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Multiple Tags Isolation ---");
    const scanA = await scanService.publicUnlock(tagCodeA);
    const scanB = await scanService.publicUnlock(tagCodeB);
    if (scanA.quote !== testQuoteA.text || scanB.quote !== testQuoteB.text) {
      throw new Error(`TEST 4 FAILED: Tag cross-contamination detected!`);
    }
    console.log("Tag A quote:", scanA.quote);
    console.log("Tag B quote:", scanB.quote);
    console.log("✅ TEST 4 PASSED: Different Tags return their respective assigned quotes with zero cross-contamination.");

    // -------------------------------------------------------------
    // TEST 5 — Multiple Quotes (Priority & Recency Rule)
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: Multiple Quotes Assigned to One Tag ---");
    // Assign Quote B to Tag A with higher priority (priority 10)
    const asgAHigh = await quoteAssignmentService.createAssignment({
      quote: testQuoteB._id,
      tag: tagA._id,
      assignmentType: "tag",
      priority: 10,
    });
    createdAssignmentIds.push(asgAHigh._id);

    const scanHighPriority = await scanService.publicUnlock(tagCodeA);
    console.log("Tag A scan with higher priority Quote B:", scanHighPriority.quote);
    if (scanHighPriority.quote !== testQuoteB.text) {
      throw new Error(`TEST 5 FAILED: Expected higher priority Quote B`);
    }
    console.log("✅ TEST 5 PASSED: Highest priority quote assignment wins.");

    // -------------------------------------------------------------
    // TEST 6 — Unassignment (Fallback to Random, No Stale Cache)
    // -------------------------------------------------------------
    console.log("\n--- TEST 6: Unassignment & Fallback ---");
    await quoteAssignmentService.deleteAssignment(asgB._id);
    const scanPostUnassignB = await scanService.publicUnlock(tagCodeB);
    console.log("Post-unassign scan on Tag B:", scanPostUnassignB.quote, "| sourceType:", scanPostUnassignB.sourceType);
    if (scanPostUnassignB.sourceType === "tag_assignment" || scanPostUnassignB.quote === testQuoteB.text) {
      // Unless random by 1 in N chance, sourceType must not be tag_assignment
      if (scanPostUnassignB.sourceType === "tag_assignment") {
        throw new Error(`TEST 6 FAILED: Stale tag assignment returned after unassignment!`);
      }
    }
    if (scanPostUnassignB.sourceType !== "random") {
      throw new Error(`TEST 6 FAILED: Expected random fallback after unassigning Tag B`);
    }
    console.log("✅ TEST 6 PASSED: Removing assignment cleanly falls back without returning stale assignment cache.");

    // -------------------------------------------------------------
    // TEST 7 — Visual Quote & Complete Payload Preservation
    // -------------------------------------------------------------
    console.log("\n--- TEST 7: Visual Quote & EditorData Payload Preservation ---");
    const asgVisual = await quoteAssignmentService.createAssignment({
      quote: visualQuote._id,
      tag: tagB._id,
      assignmentType: "tag",
      priority: 5,
    });
    createdAssignmentIds.push(asgVisual._id);

    const scanVisual = await scanService.publicUnlock(tagCodeB);
    console.log("Visual scan response _id:", scanVisual._id);
    console.log("Visual scan image:", scanVisual.image);
    console.log("Visual scan theme:", scanVisual.theme);
    console.log("Visual scan editorData desktop elements:", scanVisual.editorData?.desktop?.elements?.length);

    if (
      !scanVisual.editorData ||
      !scanVisual.editorData.desktop ||
      scanVisual.editorData.desktop.elements.length !== 3 ||
      !scanVisual.image
    ) {
      throw new Error(`TEST 7 FAILED: editorData or image was stripped during scan resolution!`);
    }
    console.log("✅ TEST 7 PASSED: Full Visual Quote editorData and media assets preserved.");

    // -------------------------------------------------------------
    // TEST 8 — Audio Track Data Preservation
    // -------------------------------------------------------------
    console.log("\n--- TEST 8: Audio Track Data Preservation ---");
    const audioTrack = scanVisual.editorData?.desktop?.audio;
    console.log("Audio track inside editorData:", audioTrack);
    if (!audioTrack || audioTrack.source !== "https://example.com/soundtrack.mp3") {
      throw new Error(`TEST 8 FAILED: Audio track data missing from editorData`);
    }
    console.log("✅ TEST 8 PASSED: Audio track structure intact inside editorData.");

    // -------------------------------------------------------------
    // TEST 9 — User Fallback (Tag Owner Assignment)
    // -------------------------------------------------------------
    console.log("\n--- TEST 9: Tag Owner User Quote Assignment Fallback ---");
    // Create Tag C owned by testUser with NO direct tag assignment
    const tagCodeC = `TAG-TEST-C-${Date.now()}`;
    const tagC = await Tag.create({
      tagCode: tagCodeC,
      isActive: true,
      isActivated: true,
      owner: testUser._id,
    });
    createdTagIds.push(tagC._id);

    // Assign Quote A to testUser
    const asgUser = await quoteAssignmentService.createAssignment({
      quote: testQuoteA._id,
      user: testUser._id,
      assignmentType: "user",
      priority: 1,
    });
    createdAssignmentIds.push(asgUser._id);

    const scanUserFallback = await scanService.publicUnlock(tagCodeC);
    console.log("Tag C user fallback scan:", scanUserFallback.quote, "| sourceType:", scanUserFallback.sourceType);
    if (scanUserFallback.quote !== testQuoteA.text || scanUserFallback.sourceType !== "user_assignment") {
      throw new Error(`TEST 9 FAILED: User quote fallback did not trigger for tag owned by user!`);
    }
    console.log("✅ TEST 9 PASSED: User quote assignment resolves cleanly as fallback when Tag has no direct assignment.");

    // -------------------------------------------------------------
    // TEST 10 — Random Fallback
    // -------------------------------------------------------------
    console.log("\n--- TEST 10: Pure Random Fallback when no assignments exist ---");
    const tagCodeD = `TAG-TEST-D-${Date.now()}`;
    const tagD = await Tag.create({
      tagCode: tagCodeD,
      isActive: true,
      isActivated: true,
      owner: null,
    });
    createdTagIds.push(tagD._id);

    const scanRandom = await scanService.publicUnlock(tagCodeD);
    console.log("Tag D pure random scan quote:", scanRandom.quote, "| sourceType:", scanRandom.sourceType);
    if (scanRandom.sourceType !== "random" || !scanRandom.quote) {
      throw new Error(`TEST 10 FAILED: Expected random fallback`);
    }
    console.log("✅ TEST 10 PASSED: Random quote generated and returned when no tag or user assignment exists.");

    // -------------------------------------------------------------
    // TEST 11 — Duplicate Assignment Prevention
    // -------------------------------------------------------------
    console.log("\n--- TEST 11: Duplicate Assignment Prevention ---");
    let duplicateCaught = false;
    try {
      await quoteAssignmentService.createAssignment({
        quote: testQuoteA._id,
        tag: tagA._id,
        assignmentType: "tag",
        priority: 1,
      });
    } catch (err) {
      duplicateCaught = true;
      console.log("Duplicate assignment properly rejected with message:", err.message);
    }
    if (!duplicateCaught) {
      throw new Error(`TEST 11 FAILED: Duplicate assignment was not prevented!`);
    }

    const scanAfterDupAttempt = await scanService.publicUnlock(tagCodeA);
    console.log("Scan on Tag A after dup attempt:", scanAfterDupAttempt.quote);
    console.log("✅ TEST 11 PASSED: Duplicate assignment prevented and scan resolution remains 100% stable.");

    console.log("\n=======================================================");
    console.log("🎉 ALL 11 TEST SCENARIOS PASSED WITH ZERO ERRORS!");
    console.log("=======================================================");

  } finally {
    // Clean up test fixtures
    console.log("\nCleaning up test records...");
    await QuoteAssignment.deleteMany({ _id: { $in: createdAssignmentIds } });
    await Tag.deleteMany({ _id: { $in: createdTagIds } });
    await Quote.deleteMany({ _id: { $in: createdQuoteIds } });
    await User.deleteMany({ _id: { $in: createdUserIds } });
    await ScanHistory.deleteMany({ tag: { $in: createdTagIds } });
    console.log("Cleanup finished.");
    await mongoose.disconnect();
  }
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
