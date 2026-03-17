/**
 * NewsSearchService — uses OpenAI web_search_preview to fetch live $POET news.
 * Runs once per simulation round and injects results into agent prompts.
 * Requires OPENAI_API_KEY in .env. Gracefully no-ops if key is absent.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CACHE_TTL_MS = 10 * 60 * 1000; // re-fetch at most once every 10 minutes

let cachedNews: string | null = null;
let cacheExpiresAt = 0;

export async function fetchLivePoetNews(): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  // Serve cache if still fresh
  if (cachedNews && Date.now() < cacheExpiresAt) {
    return cachedNews;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: `Search for the latest news about POET Technologies ($POET, ticker: POET on NASDAQ, PTK on TSX-V) from the past 7 days. Focus on: stock price moves, earnings releases, new partnership announcements, analyst upgrades/downgrades, product launches, and any major news. Return a concise 10-15 bullet point summary of the most important recent developments, each with a date if available. Format as plain text bullet points starting with "•".`,
      }),
    });

    if (!response.ok) {
      console.warn(`[NewsSearch] OpenAI request failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      output_text?: string;
      output?: Array<{
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };

    // Extract text from output
    let text = data.output_text ?? '';
    if (!text && data.output) {
      text = data.output
        .flatMap(o => o.content ?? [])
        .filter(c => c.type === 'output_text' || c.text)
        .map(c => c.text?.trim())
        .filter(Boolean)
        .join('\n');
    }

    if (!text) return null;

    cachedNews = text;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    console.log('[NewsSearch] Fetched fresh $POET news from OpenAI web search');
    return cachedNews;
  } catch (err) {
    console.warn('[NewsSearch] Failed to fetch live news:', err);
    return null;
  }
}
