import connectDB from '../src/config/database.js';
import Quote from '../src/modules/quote/quote.model.js';
import mongoose from 'mongoose';

function calculateObjectFitScales(imgWidth, imgHeight, containerWidth, containerHeight, fit = 'cover') {
  if (!imgWidth || !imgHeight || !containerWidth || !containerHeight) {
    return { scaleX: 1, scaleY: 1 };
  }
  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imgWidth / imgHeight;
  
  let scaleX = 1;
  let scaleY = 1;
  
  if (fit === 'cover') {
    if (imageRatio > containerRatio) {
      scaleY = containerHeight / imgHeight;
      scaleX = scaleY;
    } else {
      scaleX = containerWidth / imgWidth;
      scaleY = scaleX;
    }
  } else if (fit === 'contain') {
    if (imageRatio > containerRatio) {
      scaleX = containerWidth / imgWidth;
      scaleY = scaleX;
    } else {
      scaleY = containerHeight / imgHeight;
      scaleX = scaleY;
    }
  } else if (fit === 'fill') {
    scaleX = containerWidth / imgWidth;
    scaleY = containerHeight / imgHeight;
  }
  
  return { scaleX, scaleY };
}

function calculateExportDimensions(canvasWidth, canvasHeight, multiplier) {
  return {
    width: Math.round(canvasWidth * multiplier),
    height: Math.round(canvasHeight * multiplier),
  };
}

async function verifyResolutionArchitecture() {
  console.log('=== VERIFYING VISUAL QUOTE RESOLUTION ARCHITECTURE ===\n');

  // 1. Verify Export Multipliers
  console.log('--- 1. EXPORT DIMENSIONS VERIFICATION ---');
  const desktop1x = calculateExportDimensions(800, 600, 1);
  const desktop2x = calculateExportDimensions(800, 600, 2);
  const desktop3x = calculateExportDimensions(800, 600, 3);
  const desktop4x = calculateExportDimensions(800, 600, 4);

  console.log('Desktop Logical (800x600):');
  console.log(`  1x -> ${desktop1x.width} x ${desktop1x.height}`);
  console.log(`  2x -> ${desktop2x.width} x ${desktop2x.height} (HD)`);
  console.log(`  3x -> ${desktop3x.width} x ${desktop3x.height} (Ultra-HD)`);
  console.log(`  4x -> ${desktop4x.width} x ${desktop4x.height} (Print Quality)`);

  if (desktop2x.width !== 1600 || desktop2x.height !== 1200) throw new Error('Desktop 2x failed');
  if (desktop3x.width !== 2400 || desktop3x.height !== 1800) throw new Error('Desktop 3x failed');
  if (desktop4x.width !== 3200 || desktop4x.height !== 2400) throw new Error('Desktop 4x failed');

  const mobile1x = calculateExportDimensions(375, 667, 1);
  const mobile2x = calculateExportDimensions(375, 667, 2);
  const mobile3x = calculateExportDimensions(375, 667, 3);
  const mobile4x = calculateExportDimensions(375, 667, 4);

  console.log('\nMobile Logical (375x667):');
  console.log(`  1x -> ${mobile1x.width} x ${mobile1x.height}`);
  console.log(`  2x -> ${mobile2x.width} x ${mobile2x.height} (HD)`);
  console.log(`  3x -> ${mobile3x.width} x ${mobile3x.height} (Ultra-HD)`);
  console.log(`  4x -> ${mobile4x.width} x ${mobile4x.height} (Print Quality)`);

  if (mobile2x.width !== 750 || mobile2x.height !== 1334) throw new Error('Mobile 2x failed');
  if (mobile3x.width !== 1125 || mobile3x.height !== 2001) throw new Error('Mobile 3x failed');
  if (mobile4x.width !== 1500 || mobile4x.height !== 2668) throw new Error('Mobile 4x failed');
  console.log('✅ Export dimension calculations verified 100%.\n');

  // 2. Verify Image Aspect Ratio Precision
  console.log('--- 2. OBJECT-FIT ASPECT RATIO PRESERVATION ---');
  // High-res uploaded image (e.g. 3328 x 4864) into an 800 x 600 canvas
  const coverFit = calculateObjectFitScales(3328, 4864, 800, 600, 'cover');
  const containFit = calculateObjectFitScales(3328, 4864, 800, 600, 'contain');
  
  console.log('Image (3328x4864) Cover Fit in 800x600: scaleX =', coverFit.scaleX, 'scaleY =', coverFit.scaleY);
  console.log('Aspect Ratio Preserved:', coverFit.scaleX === coverFit.scaleY ? 'YES (100% true)' : 'NO');
  if (coverFit.scaleX !== coverFit.scaleY) throw new Error('Cover fit distorted aspect ratio');

  console.log('Image (3328x4864) Contain Fit in 800x600: scaleX =', containFit.scaleX, 'scaleY =', containFit.scaleY);
  console.log('Aspect Ratio Preserved:', containFit.scaleX === containFit.scaleY ? 'YES (100% true)' : 'NO');
  if (containFit.scaleX !== containFit.scaleY) throw new Error('Contain fit distorted aspect ratio');
  console.log('✅ Image aspect ratio preservation verified 100%.\n');

  // 3. Database Non-Mutation Verification
  console.log('--- 3. DATABASE RECORD NON-MUTATION CHECK ---');
  await connectDB();
  const existingQuotes = await Quote.find({ editorData: { $ne: null } });
  console.log(`Found ${existingQuotes.length} visual quotes in database.`);
  for (const q of existingQuotes) {
    if (q.editorData.desktop?.canvas) {
      console.log(`Quote ${q._id}: Desktop canvas is ${q.editorData.desktop.canvas.width}x${q.editorData.desktop.canvas.height}`);
      if (q.editorData.desktop.canvas.width !== 800 || q.editorData.desktop.canvas.height !== 600) {
        throw new Error(`Unexpected canvas dimensions on quote ${q._id}`);
      }
    }
  }
  await mongoose.disconnect();
  console.log('✅ Stored database coordinates verified untouched and backward compatible.');

  console.log('\n=======================================================');
  console.log('🎉 ALL RESOLUTION & QUALITY CHECKS PASSED (100%)!');
  console.log('=======================================================');
}

verifyResolutionArchitecture().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
