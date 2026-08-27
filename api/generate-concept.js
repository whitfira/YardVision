// ============================================================
// Yard Vision — Vercel Serverless Function (With Database Gatekeeper)
// File location in GitHub repo: api/generate-concept.js
// ============================================================

import { kv } from '@vercel/kv';

export const config = {
  maxDuration: 300,
};

export default async function (req, res) {


  // ────────────────────────────────────────────────────────────
  // DOMAIN GATEKEEPER & USAGE TRACKING
  // ────────────────────────────────────────────────────────────
  
  // 1. Get the domain of the website where the app is loaded
  const referer = req.headers.referer;
  let domain = 'unknown';
  
  if (referer) {
    try {
      domain = new URL(referer).hostname.replace('www.', '');
    } catch (e) {
      domain = 'unknown';
    }
  }

  // 2. Grant your main business website unlimited demo renders automatically
  const YOUR_MAIN_DOMAIN = 'bizprotool360.com';
  
  if (domain !== YOUR_MAIN_DOMAIN && domain !== 'yard-vision-red.vercel.app') {
    // 3. Fetch contractor subscription data from the free Vercel KV Database
    const subscription = await kv.get(`contractor:${domain}`);

    // If the domain is not in your database, block them
    if (!subscription || !subscription.active) {
      return res.status(403).json({ 
        error: `Access Denied: ${domain} is not registered. Please contact Yard Vision.` 
      });
    }

    // If they hit their monthly tier limit (50 or 150), lock the app automatically
    if (subscription.used >= subscription.limit) {
      return res.status(429).json({ 
        error: "Monthly render limit reached for this website. Please upgrade your tier." 
      });
    }

    // 4. Increment their usage counter in the database by +1
    subscription.used += 1;
    await kv.set(`contractor:${domain}`, subscription);
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

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error — API key not set' });
  }

  // ── Budget guidance ──
  const budgetMap = {
    'Under $25,000':       'Use modest materials: stamped concrete, basic pavers, simple sod, native low-maintenance plantings.',
    '$25,000 – $50,000':   'Use mid-range materials: natural pavers, basic pool finishes, decorative concrete, ornamental shrubs.',
    '$50,000 – $100,000':  'Use quality materials: travertine or bluestone pavers, tiled pool, built-in seating, lush landscaping.',
    '$100,000 – $200,000': 'Use premium materials: natural stone, custom pool, outdoor kitchen, pergola, full professional landscaping.',
    '$200,000+':           'Use luxury materials: imported stone, infinity pool, full outdoor living pavilion, resort-style landscaping.',
  };

  // ── Style guidance ──
  const styleMap = {
    'Modern / Contemporary':    'Clean geometric lines, minimalist planting, concrete accents, rectangular shapes, ornamental grasses.',
    'Traditional / Classic':    'Symmetrical layouts, brick or tumbled stone, manicured hedges, classic pool coping, roses and perennials.',
    'Tropical / Resort':        'Lush tropical plantings, palm trees, freeform pool, natural stone, dense green foliage.',
    'Rustic / Natural':         'Natural fieldstone, weathered wood, wildflower plantings, irregular organic shapes, earthy tones.',
    'Mediterranean':            'Terracotta tiles, stucco walls, olive trees, lavender, fountain features, warm sandy tones.',
    'Minimalist':               'Extremely clean lines, monochromatic palette, sparse planting, large format pavers, negative space.',
    'Cottage / English Garden': 'Lush mixed flower borders, climbing roses, stone pathways, picket fencing, colorful plantings.',
  };

  const budgetGuidance = budgetMap[budgetTier]    || '';
  const styleGuidance  = styleMap[stylePreference] || '';

  // ── Build edit prompt ──
  const editPrompt =
    'Edit this residential yard photo to show the completed landscape project. '
    + 'ABSOLUTE RULES — NO EXCEPTIONS: '
    + '(1) PRESERVE the exact time of day, sky, lighting, color temperature, and shadows. If daytime keep daytime. Never change to evening, twilight, or night for any reason whatsoever. '
    + '(2) PRESERVE the exact camera angle, zoom level, focal length, framing, and field of view. Do not zoom in, zoom out, crop, or reframe in any way. '
    + '(3) PRESERVE the house exterior, roof, windows, walls, and all existing structures pixel-identically. '
    + '(4) ONLY modify the yard and outdoor space as described below. Change nothing else. '
    + 'PROJECT TYPE: ' + projectType + '. '
    + 'STYLE: ' + stylePreference + ' — ' + styleGuidance + ' '
    + 'BUDGET: ' + budgetTier + ' — ' + budgetGuidance + ' '
    + (description ? 'CLIENT DETAILS: ' + description + '. ' : '')
    + 'Photorealistic architectural visualization quality. No people, no text, no watermarks.';

  console.log('Edit prompt:', editPrompt);

  // ── Build multipart form for gpt-image-2 edits endpoint ──
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
        'Content-Type':  'multipart/form-data; boundary=' + boundary,
        'Content-Length': String(bodyBuffer.length),
      },
      body: bodyBuffer,
    });

    const responseText = await openaiResponse.text();
    console.log('OpenAI raw response:', responseText);

    if (!openaiResponse.ok) {
      console.error('OpenAI API error:', responseText);
      return res.status(502).json({ error: 'Failed to generate concept image. Please try again.' });
    }

    const openaiData = JSON.parse(responseText);
    const imageData  = openaiData.data[0];

    if (imageData.url) {
      generatedImageUrl = imageData.url;
    } else if (imageData.b64_json) {
      generatedImageUrl = 'data:image/png;base64,' + imageData.b64_json;
    } else {
      throw new Error('No image data in OpenAI response');
    }

  } catch (err) {
    console.error('OpenAI call failed:', err);
    return res.status(500).json({ error: 'Unexpected error: ' + err.message });
  }

  return res.status(200).json({
    imageUrl:   generatedImageUrl,
    promptUsed: editPrompt,
  });
}
