// ============================================================
// Yard Vision — Vercel Serverless Function
// File location in GitHub repo: api/generate-concept.js
//
// Uses fal.ai gpt-image-2 edit endpoint — faster than calling
// OpenAI directly, with streaming support and 60s compatibility.
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

  const { imageBase64, imageMediaType, projectType, stylePreference, budgetTier, description } = req.body;

  if (!imageBase64 || !projectType || !stylePreference || !budgetTier) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const FAL_API_KEY = process.env.FAL_API_KEY;

  if (!FAL_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error — API key not set' });
  }

  // ── Build budget guidance ──
  let budgetGuidance = '';
  if (budgetTier === 'Under $25,000') {
    budgetGuidance = 'Use modest cost-effective materials such as stamped concrete, basic pavers, simple sod lawn, and native low-maintenance plantings.';
  } else if (budgetTier === '$25,000 – $50,000') {
    budgetGuidance = 'Use mid-range materials such as natural pavers, basic pool finishes, decorative concrete, and ornamental shrubs and grasses.';
  } else if (budgetTier === '$50,000 – $100,000') {
    budgetGuidance = 'Use quality materials such as travertine or bluestone pavers, tiled pool finishes, built-in seating, and lush ornamental landscaping.';
  } else if (budgetTier === '$100,000 – $200,000') {
    budgetGuidance = 'Use premium materials such as natural stone, custom pool features, outdoor kitchen, pergola structures, and full professional landscaping.';
  } else if (budgetTier === '$200,000+') {
    budgetGuidance = 'Use luxury materials such as imported stone, custom infinity or geometric pool, full outdoor living pavilion, resort-style landscaping, and high-end water features.';
  }

  // ── Build style guidance ──
  let styleGuidance = '';
  if (stylePreference === 'Modern / Contemporary') {
    styleGuidance = 'Clean geometric lines, minimalist planting, concrete and steel accents, rectangular pool shapes, ornamental grasses, and crisp edging.';
  } else if (stylePreference === 'Traditional / Classic') {
    styleGuidance = 'Symmetrical layouts, brick or tumbled stone, manicured hedges, classic pool coping, flower beds with roses and perennials.';
  } else if (stylePreference === 'Tropical / Resort') {
    styleGuidance = 'Lush tropical plantings, palm trees, freeform pool shape, natural stone, tiki elements, and dense green foliage.';
  } else if (stylePreference === 'Rustic / Natural') {
    styleGuidance = 'Natural fieldstone, weathered wood, wildflower meadow plantings, irregular organic shapes, and earthy warm tones.';
  } else if (stylePreference === 'Mediterranean') {
    styleGuidance = 'Terracotta tiles, stucco walls, olive trees, lavender, fountain features, arched elements, and warm sandy tones.';
  } else if (stylePreference === 'Minimalist') {
    styleGuidance = 'Extremely clean lines, monochromatic palette, sparse planting, large format pavers with wide grout joints, and negative space.';
  } else if (stylePreference === 'Cottage / English Garden') {
    styleGuidance = 'Lush mixed flower borders, climbing roses, stone pathways, picket or wrought iron fencing, and abundant colorful plantings.';
  }

  // ── Build the edit prompt ──
  const editPrompt =
    'Edit this residential yard photo to show the completed landscape project described below. '
    + 'ABSOLUTE RULES — DO NOT VIOLATE UNDER ANY CIRCUMSTANCES: '
    + '(1) PRESERVE the exact time of day, sky brightness, lighting, color temperature, and shadow direction. If daytime, keep daytime. Never change to evening, twilight, dusk, or night for any reason. '
    + '(2) PRESERVE the exact camera angle, zoom level, focal length, framing, and field of view. Do not zoom in or out. Do not crop or reframe. '
    + '(3) PRESERVE the house exterior, roof, windows, walls, doors, and all existing structures exactly as they appear — pixel identical. '
    + '(4) PRESERVE the exact perspective and horizon line. '
    + 'ONLY CHANGE THE YARD AND OUTDOOR SPACE AS FOLLOWS: '
    + 'Project: ' + projectType + '. '
    + 'Style: ' + stylePreference + ' — ' + styleGuidance + ' '
    + 'Budget: ' + budgetTier + ' — ' + budgetGuidance + ' '
    + (description ? 'Client details: ' + description + '. ' : '')
    + 'Photorealistic architectural visualization. No people, no text, no watermarks.';

  console.log('Edit prompt:', editPrompt);

  // ── Convert base64 to data URI for fal.ai ──
  const mimeType    = imageMediaType || 'image/jpeg';
  const imageDataUri = 'data:' + mimeType + ';base64,' + imageBase64;

  // ── Call fal.ai gpt-image-2 edit endpoint ──
  let generatedImageUrl;
  try {
    const falResponse = await fetch('https://fal.run/fal-ai/openai/gpt-image-2/edit', {
      method: 'POST',
      headers: {
        'Authorization': 'Key ' + FAL_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt:      editPrompt,
        image_url:   imageDataUri,
        image_size:  'auto',
        quality:     'high',
        num_images:  1,
      }),
    });

    if (!falResponse.ok) {
      const err = await falResponse.text();
      console.error('fal.ai API error:', err);
      return res.status(502).json({ error: 'Failed to generate concept image. Please try again.' });
    }

    const falData = await falResponse.json();
    console.log('fal.ai response:', JSON.stringify(falData));

    if (falData.images && falData.images[0] && falData.images[0].url) {
      generatedImageUrl = falData.images[0].url;
    } else {
      throw new Error('No image returned from fal.ai');
    }

  } catch (err) {
    console.error('fal.ai call failed:', err);
    return res.status(500).json({ error: 'Unexpected error calling image generation API.' });
  }

  return res.status(200).json({
    imageUrl: generatedImageUrl,
    promptUsed: editPrompt,
  });
}
