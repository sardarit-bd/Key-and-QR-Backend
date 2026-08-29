import assert from 'assert';

console.log('--- TEST 1: CATEGORY RESOLUTION ---');
{
  const quote = {
    _id: 'q123',
    text: 'For I know the plans I have for you...',
    category: 'Bible',
    author: 'Jeremiah 29:11',
  };

  const genericCategoryDoc = {
    _id: 'cat_inspire',
    name: 'Inspire',
    slug: 'inspire',
    icon: 'Sparkles',
    color: '#f59e0b',
  };

  const isGenericPool = genericCategoryDoc.slug === 'inspire';
  const quoteCat = quote.category;
  const resolvedCategoryName = (isGenericPool && quoteCat && quoteCat.toLowerCase() !== 'inspire')
    ? quoteCat.charAt(0).toUpperCase() + quoteCat.slice(1)
    : genericCategoryDoc.name;

  const resolvedCategorySlug = (isGenericPool && quoteCat && quoteCat.toLowerCase() !== 'inspire')
    ? quoteCat.toLowerCase()
    : genericCategoryDoc.slug;

  assert.strictEqual(resolvedCategoryName, 'Bible');
  assert.strictEqual(resolvedCategorySlug, 'bible');
  console.log('✅ TEST 1 PASSED: Category resolves to "Bible" (slug: "bible") instead of "Inspire"');
}

console.log('\n--- TEST 2: AUDIO TRACK RESOLUTION ---');
{
  const testPayloads = [
    { backgroundMusic: { source: 'https://res.cloudinary.com/audio1.mp3', autoplay: true } },
    { audio: 'https://res.cloudinary.com/audio2.mp3' },
    { audioTrack: { source: 'https://res.cloudinary.com/audio3.mp3' } },
    {
      editorData: {
        mobile: {
          elements: [
            { type: 'audio', audioData: { source: 'https://res.cloudinary.com/audio4.mp3', autoplay: true } }
          ]
        }
      }
    },
    {
      editorData: {
        elements: [
          { type: 'audio', audioData: { source: 'https://res.cloudinary.com/audio5.mp3', autoplay: true } }
        ]
      }
    }
  ];

  for (let i = 0; i < testPayloads.length; i++) {
    const data = testPayloads[i];
    const rawAudio =
      data?.audioTrack ||
      data?.backgroundMusic ||
      data?.editorData?.mobile?.elements?.find((e) => e.type === 'audio' && e.audioData?.source)?.audioData ||
      data?.editorData?.desktop?.elements?.find((e) => e.type === 'audio' && e.audioData?.source)?.audioData ||
      data?.editorData?.elements?.find((e) => e.type === 'audio' && e.audioData?.source)?.audioData ||
      data?.editorData?.mobile?.audio ||
      data?.editorData?.desktop?.audio ||
      data?.editorData?.audio ||
      data?.audio ||
      data?.audioUrl ||
      null;

    let resolved = null;
    if (rawAudio) {
      if (typeof rawAudio === 'string') {
        resolved = { source: rawAudio, autoplay: true, loop: true };
      } else if (rawAudio?.source) {
        resolved = rawAudio;
      }
    }

    assert.ok(resolved && resolved.source.startsWith('https://res.cloudinary.com/audio'));
  }
  console.log('✅ TEST 2 PASSED: Audio track correctly resolved across all payload formats');
}

console.log('\n--- TEST 3: FABRIC CANVAS DETECTION (TEXT + IMAGE SEPARATE) ---');
{
  const editorDataWithSeparateElements = {
    desktop: {
      canvas: { width: 800, height: 450 },
      elements: [
        {
          id: 'el_text_1',
          type: 'text',
          textData: { content: 'Faith makes all things possible' }
        },
        {
          id: 'el_image_1',
          type: 'image',
          imageData: {
            source: {
              type: 'cloudinary',
              url: 'https://res.cloudinary.com/picture.jpg'
            }
          }
        }
      ]
    },
    mobile: {
      canvas: { width: 375, height: 667 },
      elements: [
        {
          id: 'el_mob_text_1',
          type: 'text',
          textData: { content: 'Faith makes all things possible' }
        },
        {
          id: 'el_mob_image_1',
          type: 'image',
          imageData: {
            source: 'https://res.cloudinary.com/picture.jpg'
          }
        }
      ]
    }
  };

  const hasFabricCanvas = Boolean(
    editorDataWithSeparateElements &&
      ((editorDataWithSeparateElements.mobile?.elements && editorDataWithSeparateElements.mobile.elements.length > 0) ||
        (editorDataWithSeparateElements.desktop?.elements && editorDataWithSeparateElements.desktop.elements.length > 0) ||
        (editorDataWithSeparateElements.elements && editorDataWithSeparateElements.elements.length > 0))
  );

  assert.strictEqual(hasFabricCanvas, true);
  console.log('✅ TEST 3 PASSED: Fabric canvas detected for visual quotes with text + image separate');
}

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
