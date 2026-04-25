// ============================================================
// Yard Vision — Vercel Serverless Function
// File location in GitHub repo: api/generate-concept.js
//
// Uses fal.ai gpt-image-2 edit endpoint.
// Endpoint: https://fal.run/openai/gpt-image-2/edit
//
// Required environment variables (set in Vercel dashboard):
//   FAL_API_KEY — from fal.ai dashboard
// ============================================================

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    imageBase64,
    imageMediaType,
    projectType,
    stylePreference,
    budgetTier,
    description
  } = req.body;

  if (!imageBase64 || !projectType || !stylePreference || !budgetTier) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const FAL_API_KEY = process.env.FAL_API_KEY;
  if (!FAL_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error — API key not set' });
  }

  // ── Budget guidance ──
  const budgetMap = {
    'Under $25,000':          'Use modest materials: stamped concrete, basic pavers, simple sod, native low-maintenance plantings.',
    '$25,000 – $50,000':      'Use mid-range materials: natural pavers, basic pool finishes, decorative concrete, ornamental shrubs.',
    '$50,000 – $100,000':     'Use quality materials: travertine or bluestone pavers, tiled pool, built-in seating, lush landscaping.',
    '$100,000 – $200,000':    'Use premium materials: natural stone, custom pool, outdoor kitchen, pergola, full professional landscaping.',
    '$200,000+':              'Use luxury materials: imported stone, infinity pool, outdoor living pavilion, resort-style landscaping.',
  };

  // ── Style guidance ──
  const styleMap = {
    'Modern / Contemporary':  'Clean geometric lines, minimalist planting, concrete accents, rectangular shapes, ornamental grasses.',
    'Traditional / Classic':  'Symmetrical layouts, brick or tumbled stone, manicured hedges, classic pool coping, roses and perennials.',
    'Tropical / Resort':      'Lush tropical plantings, palm trees, freeform pool, natural stone, dense green foliage.',
    'Rustic / Natural':       'Natural fieldstone, weathered wood, wildflower plantings, irregular organic shapes, earthy tones.',
    'Mediterranean':          'Terracotta tiles, stucco walls, olive trees, lavender, fountain features, warm sandy tones.',
    'Minimalist':             'Extremely clean lines, monochromatic palette, sparse planting, large format pavers, negative space.',
    'Cottage / English Garden': 'Lush mixed flower borders, climbing roses, stone pathways, picket fencing, abundant colorful plantings.',
  };

  const budgetGuidance = budgetMap[budgetTier]   || '';
  const styleGuidance  = styleMap[stylePreference] || '';

  // ── Build edit prompt ──
  const editPrompt =
    'Edit this residential yard photo to show the completed landscape project. '
    + 'ABSOLUTE RULES — NO EXCEPTIONS: '
    + '(1) PRESERVE the exact time of day, sky, lighting, color temperature, and shadows. If daytime keep daytime. Never change to evening, twilight, or night. '
    + '(2) PRESERVE the exact camera angle, zoom, focal length, framing, and field of view. Do not zoom in, zoom out, or reframe. '
    + '(3) PRESERVE the house exterior, roof, windows, walls, doors pixel-identically. '
    + '(4) ONLY change the yard and outdoor space. '
    + 'PROJECT: ' + projectType + '. '
    + 'STYLE: ' + stylePreference + ' — ' + styleGuidance + ' '
    + 'BUDGET: ' + budgetTier + ' — ' + budgetGuidance + ' '
    + (description ? 'CLIENT DETAILS: ' + description + '. ' : '')
    + 'Photorealistic. No people, no text, no watermarks.';

  console.log('Edit prompt:', editPrompt);

  // ── Convert to data URI for fal.ai ──
  const mimeType     = imageMediaType || 'image/jpeg';
  const imageDataUri = 'data:' + mimeType + ';base64,' + imageBase64;

  // ── Call fal.ai gpt-image-2 edit endpoint ──
  let generatedImageUrl;
  try {
    const falResponse = await fetch('https://fal.run/openai/gpt-image-2/edit', {
      method: 'POST',
      headers: {
        'Authorization': 'Key ' + FAL_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt:      editPrompt,
        image_urls:  [imageDataUri],
        image_size:  'auto',
        quality:     'high',
        num_images:  1,
      }),
    });

    const responseText = await falResponse.text();
    console.log('fal.ai raw response:', responseText);

    if (!falResponse.ok) {
      console.error('fal.ai API error:', responseText);
      return res.status(502).json({ error: 'Failed to generate concept image. Please try again.' });
    }

    const falData = JSON.parse(responseText);

    if (falData.images && falData.images[0] && falData.images[0].url) {
      generatedImageUrl = falData.images[0].url;
    } else {
      throw new Error('No image URL in fal.ai response: ' + responseText);
    }

  } catch (err) {
    console.error('fal.ai call failed:', err);
    return res.status(500).json({ error: 'Unexpected error: ' + err.message });
  }

  return res.status(200).json({
    imageUrl:   generatedImageUrl,
    promptUsed: editPrompt,
  });
}
