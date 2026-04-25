// ============================================================
// Yard Vision — Vercel Serverless Function
// File location in GitHub repo: api/generate-concept.js
//
// Streamlined single-step version — goes direct to gpt-image-2
// edits endpoint with no Anthropic middle step for speed.
//
// Required environment variables (set in Vercel dashboard):
//   OPENAI_API_KEY — from platform.openai.com
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

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error — API key not set' });
  }

  // ── Build budget guidance ──
  let budgetGuidance = '';
  if (budgetTier === 'Under $25,000') {
    budgetGuidance = 'Use modest, cost-effective materials such as stamped concrete, basic pavers, simple sod lawn, and native low-maintenance plantings.';
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

  // ── Build the direct edit prompt ──
  const editPrompt =
    'This is a photo of a residential yard. Edit this photo to show the completed landscape project as described below. '
    + 'STRICT RULES — DO NOT VIOLATE THESE UNDER ANY CIRCUMSTANCES: '
    + '(1) PRESERVE the exact time of day, lighting, sky brightness, color temperature, and shadow direction from the original photo. If it is daytime, keep it daytime. Do not change to evening, twilight, dusk, or night for any reason. '
    + '(2) PRESERVE the exact camera angle, zoom level, focal length, framing, and field of view. Do not zoom in or out. Do not crop or reframe. '
    + '(3) PRESERVE the house exterior, roof, windows, walls, and all existing structures exactly as they appear. '
    + '(4) PRESERVE the exact perspective and horizon line. '
    + 'WHAT TO ADD OR CHANGE IN THE YARD ONLY: '
    + 'Project type: ' + projectType + '. '
    + 'Style: ' + stylePreference + ' — ' + styleGuidance + ' '
    + 'Budget level: ' + budgetTier + ' — ' + budgetGuidance + ' '
    + (description ? 'Additional client details: ' + description + '. ' : '')
    + 'Result must be photorealistic architectural visualization quality. No people, no text, no watermarks.';

  console.log('Edit prompt:', editPrompt);

  // ── Call gpt-image-2 EDITS endpoint directly ──
  let generatedImageUrl;
  try {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const mimeType    = imageMediaType || 'image/jpeg';
    const extension   = mimeType.split('/')[1] || 'jpg';
    const fileName    = 'yard.' + extension;

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
      Buffer.from(textField('model',   'gpt-image-2'), 'utf8'),
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
