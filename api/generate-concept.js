// ============================================================
// Yard Vision — Vercel Serverless Function
// File location in GitHub repo: api/generate-concept.js
//
// Required environment variables (set in Vercel dashboard):
//   ANTHROPIC_API_KEY   — from console.anthropic.com
//   OPENAI_API_KEY      — from platform.openai.com
// ============================================================

export const config = {
  maxDuration: 60, // 60 second timeout — requires Vercel free plan
};

export default async function handler(req, res) {

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, imageMediaType, projectType, stylePreference, budgetTier, description } = req.body;

  if (!imageBase64 || !projectType || !stylePreference || !budgetTier) {
    return res.status(400).json({ error: 'Missing required fields: imageBase64, projectType, stylePreference, budgetTier' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;

  if (!ANTHROPIC_API_KEY || !OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error — API keys not set' });
  }

  // ── STEP 1: Call Anthropic to build a rich image generation prompt ──
  let imageGenPrompt;
  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageMediaType || 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `You are an expert landscape architecture visualization prompt engineer.

I am going to show you a photo of a client's yard and home, along with their project details. Your job is to write a single, highly detailed image generation prompt (for DALL-E 3) that will produce a photorealistic architectural visualization of the finished project in that exact yard.

CLIENT PROJECT DETAILS:
- Project Type: ${projectType}
- Style Preference: ${stylePreference}
- Budget Tier: ${budgetTier}
- Client Description: ${description || 'No additional description provided.'}

INSTRUCTIONS FOR YOUR PROMPT:
1. Reference the exact yard, home exterior, camera angle, and lighting conditions visible in the uploaded photo — the house must look identical
2. Describe the finished project in rich detail, using materials, textures, plant species, and design elements that are authentic to the "${stylePreference}" style
3. Scale the design scope and material quality to the "${budgetTier}" budget — for example, under $25K means simpler finishes and plantings; $200K+ means premium stone, custom water features, full outdoor living areas
4. The scene should be: photorealistic, architectural visualization quality, golden hour or bright natural daylight, professionally landscaped, no people, no text, no watermarks
5. Write the prompt as a single detailed paragraph — do not use bullet points or labels
6. Start your response directly with the prompt text — no preamble, no explanation`,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const err = await anthropicResponse.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'Failed to generate prompt from Anthropic. Please try again.' });
    }

    const anthropicData = await anthropicResponse.json();
    imageGenPrompt = anthropicData.content[0].text.trim();

  } catch (err) {
    console.error('Anthropic call failed:', err);
    return res.status(500).json({ error: 'Unexpected error calling Anthropic API.' });
  }

  // ── STEP 2: Call OpenAI DALL-E 3 with the expanded prompt ──
  let generatedImageUrl;
  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: imageGenPrompt,
        n: 1,
        size: '1792x1024',
        quality: 'hd',
        response_format: 'url',
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      console.error('OpenAI API error:', err);
      return res.status(502).json({ error: 'Failed to generate concept image. Please try again.' });
    }

    const openaiData = await openaiResponse.json();
    generatedImageUrl = openaiData.data[0].url;

  } catch (err) {
    console.error('OpenAI call failed:', err);
    return res.status(500).json({ error: 'Unexpected error calling image generation API.' });
  }

  // ── Return result ──
  return res.status(200).json({
    imageUrl: generatedImageUrl,
    promptUsed: imageGenPrompt,
  });
}
