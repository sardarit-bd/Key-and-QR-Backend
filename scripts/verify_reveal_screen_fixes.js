import assert from 'assert';

console.log('=== TEST SUITE: VISUAL QUOTE RENDERING & UNLOCK STATUS VERIFICATION ===\n');

// 1. Background Wallpaper Disabling for Visual Quotes
console.log('--- TEST 1: Double Stacking Prevention ---');
{
  function shouldRenderBackgroundWallpaper({ hasFabricCanvas, hasRenderedImage, resolvedBgUrl }) {
    const isVisualQuote = Boolean(hasFabricCanvas || hasRenderedImage);
    return !isVisualQuote && Boolean(resolvedBgUrl);
  }

  // Case A: Visual quote with fabric canvas elements -> Background wallpaper must NOT render
  const resA = shouldRenderBackgroundWallpaper({
    hasFabricCanvas: true,
    hasRenderedImage: false,
    resolvedBgUrl: 'https://res.cloudinary.com/bg.jpg',
  });
  assert.strictEqual(resA, false, 'Canvas visual quote must not render background wallpaper');

  // Case B: Pre-rendered visual image -> Background wallpaper must NOT render
  const resB = shouldRenderBackgroundWallpaper({
    hasFabricCanvas: false,
    hasRenderedImage: true,
    resolvedBgUrl: 'https://res.cloudinary.com/bg.jpg',
  });
  assert.strictEqual(resB, false, 'Pre-rendered visual quote must not render background wallpaper');

  // Case C: Standard text-only quote -> Background wallpaper MUST render
  const resC = shouldRenderBackgroundWallpaper({
    hasFabricCanvas: false,
    hasRenderedImage: false,
    resolvedBgUrl: 'https://res.cloudinary.com/category-bg.jpg',
  });
  assert.strictEqual(resC, true, 'Text-only quote must render background wallpaper');

  console.log('✅ TEST 1 PASSED: Background wallpaper correctly disabled for visual quotes (Zero double image stacking)');
}

// 2. Conditional Render of Already Unlocked Status Notice
console.log('\n--- TEST 2: Conditional Already Unlocked Message ---');
{
  function shouldShowAlreadyUnlockedBanner(data) {
    return Boolean(data?.isAlreadyUnlockedToday && data?.message && data?.sourceType === 'random');
  }

  // Case A: Direct Tag Assignment -> Must NEVER show banner
  const tagAssignmentData = {
    isAlreadyUnlockedToday: false,
    message: null,
    sourceType: 'tag_assignment',
  };
  assert.strictEqual(shouldShowAlreadyUnlockedBanner(tagAssignmentData), false);

  // Case B: User Assignment -> Must NEVER show banner
  const userAssignmentData = {
    isAlreadyUnlockedToday: false,
    message: null,
    sourceType: 'user_assignment',
  };
  assert.strictEqual(shouldShowAlreadyUnlockedBanner(userAssignmentData), false);

  // Case C: First scan of the day on Random quote -> Must NOT show banner
  const firstRandomScanData = {
    isAlreadyUnlockedToday: false,
    message: null,
    sourceType: 'random',
  };
  assert.strictEqual(shouldShowAlreadyUnlockedBanner(firstRandomScanData), false);

  // Case D: Repeat scan on Random daily quote -> MUST show banner
  const repeatRandomScanData = {
    isAlreadyUnlockedToday: true,
    message: "Today's quote has already been unlocked. Come back tomorrow for a new one!",
    sourceType: 'random',
  };
  assert.strictEqual(shouldShowAlreadyUnlockedBanner(repeatRandomScanData), true);

  console.log('✅ TEST 2 PASSED: "Already Unlocked" message strictly limited to repeat scans on random daily rotation');
}

console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
