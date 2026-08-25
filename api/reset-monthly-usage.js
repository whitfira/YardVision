import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // 1. Verify this request is actually coming from Vercel's automated scheduler
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 2. Scan the database to find all contractor keys
    let cursor = '0';
    const keysToReset = [];

    do {
      const [nextCursor, keys] = await kv.scan(cursor, { match: 'contractor:*' });
      cursor = nextCursor;
      keysToReset.push(...keys);
    } while (cursor !== '0');

    // 3. Loop through every contractor found and reset their 'used' count to 0
    for (const key of keysToReset) {
      const subscription = await kv.get(key);
      if (subscription) {
        subscription.used = 0;
        await kv.set(key, subscription);
      }
    }

    console.log(`Successfully reset usage for ${keysToReset.length} contractors.`);
    return res.status(200).json({ success: true, message: 'All usage counters reset successfully.' });

  } catch (error) {
    console.error('Failed to reset monthly usage:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
