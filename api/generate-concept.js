// ============================================================
// Yard Vision — Vercel Serverless Function
// File location in GitHub repo: api/generate-concept.js
//
// Uses gpt-image-1 edits endpoint which takes the actual uploaded
// yard photo as input and modifies it — true photo-based generation
//
// Required environment variables (set in Vercel dashboard):
//   ANTHROPIC_API_KEY   — from console.anthropic.com
//   OPENAI_API_KEY      — from platform.openai.com
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

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;

  if (!ANTHROPIC_API_KEY || !OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error — API keys not set' });
  }

  // ── STEP 1: Call Anthropic to build a rich edit prompt ──
  let editPrompt;
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
                text: 'You are an expert landscape architecture visualization prompt engineer.\n\nI am going to show you a photo of a client\'s yard and home. Your job is to write a detailed image EDITING prompt for gpt-image-1 that will modify this exact photo to show the finished project.\n\nCLIENT PROJECT DETAILS:\n- Project Type: ' + projectType + '\n- Style Preference: ' + stylePreference + '\n- Budget Tier: ' + budgetTier + '\n- Client Description: ' + (description || 'No additional description provided.') + '\n\nCRITICAL INSTRUCTIONS:\n1. This is an IMAGE EDIT — the model will modify the actual uploaded photo directly. Keep the house, structures, camera angle, sky, and all existing elements IDENTICAL.\n2. Only describe what should be ADDED or CHANGED in the yard area — do not describe the house or existing elements.\n3. Be extremely specific about materials, textures, plant species, and design elements authentic to the ' + stylePreference + ' style.\n4. Scale the project scope to the ' + budgetTier + ' budget.\n5. Photorealistic, no people, no text, no watermarks.\n6. Write as a single concise paragraph under 800 characters. Start directly with the edit description — no preamble.',
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
    editPrompt = anthropicData.content[0].text.trim();
    console.log('Edit prompt:', editPrompt);

  } catch (err) {
    console.error('Anthropic call failed:', err);
    return res.status(500).json({ error: 'Unexpected error calling Anthropic API.' });
  }

  // ── STEP 2: Call gpt-image-1 EDITS endpoint with the actual photo ──
  let generatedImageUrl;
  try {
    // Convert base64 to binary buffer for multipart upload
    const imageBuffer   = Buffer.from(imageBase64, 'base64');
    const mimeType      = imageMediaType || 'image/jpeg';
    const extension     = mimeType.split('/')[1] || 'jpg';
    const fileName      = 'yard.' + extension;

    // Build multipart/form-data manually
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const CRLF     = '\r\n';

    const textField = (name, value) =>
      '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="' + name + '"' + CRLF +
      CRLF +
      value + CRLF;

    const fileField = (name, filename, mime, buffer) => {
      const header =
        '--' + boundary + CRLF +
        'Content-Disposition: form-data; name="' + name + '"; filename="' + filename + '"' + CRLF +
        'Content-Type: ' + mime + CRLF +
        CRLF;
      return Buffer.concat([
        Buffer.from(header, 'utf8'),
        buffer,
        Buffer.from(CRLF, 'utf8'),
      ]);
    };

    const closing = Buffer.from('--' + boundary + '--' + CRLF, 'utf8');

    const bodyParts = [
      Buffer.from(textField('model',   'gpt-image-1'), 'utf8'),
      Buffer.from(textField('prompt',  editPrompt),    'utf8'),
      Buffer.from(textField('n',       '1'),           'utf8'),
      Buffer.from(textField('size',    '1024x1024'),   'utf8'),
      Buffer.from(textField('quality', 'high'),        'utf8'),
      fileField('image', fileName, mimeType, imageBuffer),
      closing,
    ];

    const bodyBuffer = Buffer.concat(bodyParts);

    const openaiResponse = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': String(bodyBuffer.length),
      },
      body: bodyBuffer,
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      console.error('OpenAI API error:', err);
      return res.status(502).json({ error: 'Failed to generate concept image. Please try again.' });
    }

    const openaiData = await openaiResponse.json();

    // gpt-image-1 returns base64 by default — convert to data URL
    const imageData = openaiData.data[0];
    if (imageData.url) {
      generatedImageUrl = imageData.url;
    } else if (imageData.b64_json) {
      generatedImageUrl = 'data:image/png;base64,' + imageData.b64_json;
    } else {
      throw new Error('No image data returned from OpenAI');
    }

  } catch (err) {
    console.error('OpenAI call failed:', err);
    return res.status(500).json({ error: 'Unexpected error calling image generation API.' });
  }

  return res.status(200).json({
    imageUrl: generatedImageUrl,
    promptUsed: editPrompt,
  });
}
