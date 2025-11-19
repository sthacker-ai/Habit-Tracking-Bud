import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the API key from environment (server-side only, never exposed to client)
  const apiKey = process.env.GEMINI_API_SECRET;

  if (!apiKey) {
    console.error('GEMINI_API_SECRET not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Call Gemini API from the server
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Generate one short, impactful, inspirational quote about personal growth or success. Only return the quote text without any attribution or extra explanation.'
            }]
          }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 100,
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return res.status(response.status).json({ error: 'Failed to fetch quote from Gemini' });
    }

    const data = await response.json();
    
    // Extract the quote text
    const quote = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    if (!quote) {
      return res.status(500).json({ error: 'No quote generated' });
    }

    // Clean the quote
    const cleanedQuote = quote
      .replace(/"/g, '')
      .replace(/^\s+|\s+$/g, '')
      .replace(/—.*$/, '')
      .trim();

    return res.status(200).json({ quote: cleanedQuote });

  } catch (error) {
    console.error('Error fetching quote:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
