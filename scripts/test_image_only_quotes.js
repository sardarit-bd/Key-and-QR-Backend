import connectDB from '../src/config/database.js';
import Quote from '../src/modules/quote/quote.model.js';
import Tag from '../src/modules/tag/tag.model.js';
import User from '../src/models/user.model.js';
import QuoteAssignment from '../src/modules/quoteAssignment/quoteAssignment.model.js';
import tagUnlockService from '../src/modules/scan/tag-unlock.service.js';
import quoteService from '../src/modules/quote/quote.service.js';
import quoteAssignmentService from '../src/modules/quoteAssignment/quoteAssignment.service.js';
import dashboardService from '../src/modules/dashboard/dashboard.service.js';
import mongoose from 'mongoose';

async function runImageOnlyQuoteTests() {
  const createdQuoteIds = [];
  const createdTagIds = [];
  const createdUserIds = [];
  const createdAssignmentIds = [];

  try {
    await connectDB();
    console.log('=== STARTING IMAGE-ONLY VISUAL QUOTES VERIFICATION ===\n');

    const timestamp = Date.now();

    // --- TEST 1: Create Image-Only Quote (No text, No author) ---
    console.log('--- TEST 1: Create Image-Only Quote (No text, No author) ---');
    const imageOnlyPayload = {
      text: '',
      author: '',
      category: 'inspiration',
      editorData: {
        version: '2.0',
        desktop: {
          canvas: { width: 800, height: 600 },
          elements: [
            {
              id: `el_img_${timestamp}_1`,
              type: 'image',
              x: 400,
              y: 300,
              width: 800,
              height: 600,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              opacity: 1,
              visible: true,
              zIndex: 1,
              imageData: {
                source: {
                  type: 'cloudinary',
                  url: 'https://res.cloudinary.com/demo/image/upload/v1/artwork_only.jpg',
                  publicId: 'artwork_only_1',
                },
                fit: 'cover',
              },
            },
          ],
        },
        mobile: {
          canvas: { width: 375, height: 667 },
          elements: [
            {
              id: `el_mob_img_${timestamp}_1`,
              type: 'image',
              x: 187.5,
              y: 333.5,
              width: 375,
              height: 667,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              opacity: 1,
              visible: true,
              zIndex: 1,
              imageData: {
                source: {
                  type: 'cloudinary',
                  url: 'https://res.cloudinary.com/demo/image/upload/v1/artwork_mobile.jpg',
                  publicId: 'artwork_mobile_1',
                },
                fit: 'cover',
              },
            },
          ],
        },
      },
    };

    const quote1 = await quoteService.createQuote(imageOnlyPayload);
    createdQuoteIds.push(quote1._id);

    if (quote1.text === 'Untitled Quote') {
      throw new Error('FAILED: Quote text was populated with "Untitled Quote"');
    }
    if (quote1.text !== '') {
      throw new Error(`FAILED: Quote text expected "" but got "${quote1.text}"`);
    }
    if (!quote1.editorData?.desktop?.elements?.length) {
      throw new Error('FAILED: Quote editorData was not persisted');
    }
    console.log('Created Quote 1 ID:', quote1._id);
    console.log('Quote 1 text:', JSON.stringify(quote1.text));
    console.log('Quote 1 author:', JSON.stringify(quote1.author));
    console.log('Quote 1 desktop elements:', quote1.editorData.desktop.elements.length);
    console.log('✅ TEST 1 PASSED: Image-Only Quote created cleanly without "Untitled Quote".\n');

    // --- TEST 2: Create Image + Author Quote (No text) ---
    console.log('--- TEST 2: Create Image + Author Quote (No text) ---');
    const imageAuthorPayload = {
      text: '',
      author: 'Maya Angelou',
      category: 'wisdom',
      editorData: {
        version: '2.0',
        desktop: {
          canvas: { width: 800, height: 600 },
          elements: [
            {
              id: `el_img_${timestamp}_2`,
              type: 'image',
              x: 400,
              y: 300,
              width: 800,
              height: 600,
              zIndex: 1,
              imageData: {
                source: {
                  type: 'cloudinary',
                  url: 'https://res.cloudinary.com/demo/image/upload/v1/art2.jpg',
                },
              },
            },
          ],
        },
      },
    };

    const quote2 = await quoteService.createQuote(imageAuthorPayload);
    createdQuoteIds.push(quote2._id);

    if (quote2.text !== '') {
      throw new Error(`FAILED: Quote 2 text expected "" but got "${quote2.text}"`);
    }
    if (quote2.author !== 'Maya Angelou') {
      throw new Error(`FAILED: Quote 2 author expected "Maya Angelou" but got "${quote2.author}"`);
    }
    console.log('Created Quote 2 author:', quote2.author);
    console.log('Quote 2 text:', JSON.stringify(quote2.text));
    console.log('✅ TEST 2 PASSED: Image + Author Quote created without inventing fake quote text.\n');

    // --- TEST 3: Tag Assignment of Image-Only Quote ---
    console.log('--- TEST 3: Tag Assignment of Image-Only Quote ---');
    const testTagCode = `TAG-IMGTEST-${timestamp}`;
    const tag = await Tag.create({
      tagCode: testTagCode,
      isActivated: true,
      isActive: true,
    });
    createdTagIds.push(tag._id);

    const asgTag = await quoteAssignmentService.createAssignment({
      quote: quote1._id,
      assignmentType: 'tag',
      tag: tag._id,
      priority: 1,
    });
    createdAssignmentIds.push(asgTag._id);
    console.log('Assigned Quote 1 to Tag:', testTagCode);
    console.log('✅ TEST 3 PASSED: Image-Only Quote successfully assigned to QR Tag.\n');

    // --- TEST 4: QR Scan Resolution for Image-Only Quote ---
    console.log('--- TEST 4: QR Scan Resolution for Image-Only Quote ---');
    const scanResult = await tagUnlockService.publicUnlock(testTagCode);

    if (!scanResult) {
      throw new Error('FAILED: Scan returned null');
    }
    if (scanResult.sourceType !== 'tag_assignment') {
      throw new Error(`FAILED: Expected sourceType tag_assignment, got ${scanResult.sourceType}`);
    }
    if (!scanResult.editorData || !scanResult.editorData.desktop) {
      throw new Error('FAILED: Scan response missing editorData');
    }
    if (scanResult.text !== '') {
      throw new Error(`FAILED: Scan result text expected "" but got "${scanResult.text}"`);
    }
    console.log('Scan response ID:', scanResult._id);
    console.log('Scan response sourceType:', scanResult.sourceType);
    console.log('Scan response editorData desktop image:', scanResult.editorData.desktop.elements[0].imageData.source.url);
    console.log('✅ TEST 4 PASSED: Public scan deterministically returns assigned Image-Only Quote.\n');

    // --- TEST 5: User Assignment of Image-Only Quote ---
    console.log('--- TEST 5: User Assignment of Image-Only Quote ---');
    const testUser = await User.create({
      name: 'Test ImageOnly User',
      email: `imguser_${timestamp}@example.com`,
      role: 'user',
    });
    createdUserIds.push(testUser._id);

    const asgUser = await quoteAssignmentService.createAssignment({
      quote: quote2._id,
      assignmentType: 'user',
      user: testUser._id,
      priority: 1,
    });
    createdAssignmentIds.push(asgUser._id);
    console.log('Assigned Quote 2 to User:', testUser._id);
    console.log('✅ TEST 5 PASSED: Image-Only Quote successfully assigned to User.\n');

    // --- TEST 6: GetAllQuotes API / Catalog Filter Integrity ---
    console.log('--- TEST 6: GetAllQuotes API / Catalog Filter Integrity ---');
    const quotesList = await quoteService.getAllQuotes({
      page: 1,
      limit: 20,
      category: 'inspiration',
    });

    const foundQuote = quotesList.data.find((q) => q._id.toString() === quote1._id.toString());
    if (!foundQuote) {
      throw new Error('FAILED: Image-Only Quote not found in catalog listing');
    }
    if (foundQuote.text !== '') {
      throw new Error(`FAILED: Listed quote text expected "" but got "${foundQuote.text}"`);
    }
    console.log('Found in quote catalog with category:', foundQuote.category);
    console.log('✅ TEST 6 PASSED: Image-Only Quote is fully indexed and discoverable in admin catalog.\n');

    console.log('\n=======================================================');
    console.log('🎉 ALL IMAGE-ONLY VISUAL QUOTE TESTS PASSED (100%)!');
    console.log('=======================================================');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    console.log('Cleaning up test data...');
    try {
      await Quote.deleteMany({ _id: { $in: createdQuoteIds } });
      await Tag.deleteMany({ _id: { $in: createdTagIds } });
      await User.deleteMany({ _id: { $in: createdUserIds } });
      await QuoteAssignment.deleteMany({ _id: { $in: createdAssignmentIds } });
      console.log('✅ Cleanup complete.');
    } catch (cleanErr) {
      console.error('Error during cleanup:', cleanErr);
    }
    await mongoose.disconnect();
  }
}

runImageOnlyQuoteTests();
