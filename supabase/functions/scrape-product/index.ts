import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function extractHostname(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function cleanPrice(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // Remove currency symbols, spaces, keep digits and decimal separator
  const cleaned = raw.replace(/[^\d,.]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num.toFixed(2);
}

function extractFromJsonLd(html: string): Partial<{ name: string; description: string; price: string; imageUrl: string }> {
  const result: Partial<{ name: string; description: string; price: string; imageUrl: string }> = {};
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const obj = item['@type'] === 'Product' ? item :
          (item['@graph']?.find((g: Record<string, unknown>) => g['@type'] === 'Product'));
        if (!obj) continue;
        if (obj.name && !result.name) result.name = String(obj.name).trim();
        if (obj.description && !result.description) {
          result.description = String(obj.description).replace(/<[^>]+>/g, '').trim().slice(0, 300);
        }
        if (obj.image && !result.imageUrl) {
          result.imageUrl = Array.isArray(obj.image) ? obj.image[0] : String(obj.image);
        }
        if (!result.price) {
          const offers = obj.offers;
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            const rawPrice = offer?.price ?? offer?.lowPrice;
            if (rawPrice != null) result.price = cleanPrice(String(rawPrice)) ?? undefined;
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }
  return result;
}

function getMeta(html: string, ...attrs: string[]): string | null {
  for (const attr of attrs) {
    const regex = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${attr.replace('.', '\\.')}["'][^>]+content=["']([^"']+)["']`, 'i');
    const match = regex.exec(html);
    if (match) return match[1].trim();
    // Try reversed attribute order
    const regex2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${attr.replace('.', '\\.')}["']`, 'i');
    const match2 = regex2.exec(html);
    if (match2) return match2[1].trim();
  }
  return null;
}

function extractFromHtml(html: string): Partial<{ name: string; description: string; price: string; imageUrl: string }> {
  const result: Partial<{ name: string; description: string; price: string; imageUrl: string }> = {};
  
  // Open Graph + product meta
  const ogTitle = getMeta(html, 'og:title');
  const ogDesc = getMeta(html, 'og:description', 'description');
  const ogImage = getMeta(html, 'og:image');
  const ogPrice = getMeta(html, 'og:price:amount', 'product:price:amount', 'price', 'priceAmount', 'twitter:data1');

  if (ogTitle) result.name = ogTitle;
  if (ogDesc) result.description = ogDesc.replace(/<[^>]+>/g, '').trim().slice(0, 300);
  if (ogImage) result.imageUrl = ogImage;
  if (ogPrice) result.price = cleanPrice(ogPrice) ?? undefined;

  // Fallback: title tag
  if (!result.name) {
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    if (titleMatch) result.name = titleMatch[1].trim().split(' - ')[0].split(' | ')[0].trim();
  }

  // Allegro-specific price pattern
  if (!result.price) {
    const allegroMatch = /"price":\s*{[^}]*"amount":\s*"([\d.]+)"/.exec(html);
    if (allegroMatch) result.price = cleanPrice(allegroMatch[1]) ?? undefined;
  }

  // Common price patterns
  if (!result.price) {
    const pricePatterns = [
      /'price'\s*:\s*([\d]+[,.]?[\d]*)/,
      /"price"\s*:\s*"([\d]+[,.]?[\d]*)"/,
      /data-price=["']([\d]+[,.]?[\d]*)["']/,
    ];
    for (const p of pricePatterns) {
      const m = p.exec(html);
      if (m) { result.price = cleanPrice(m[1]) ?? undefined; break; }
    }
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopName = extractHostname(url);

    // Fetch the page with browser-like headers
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch URL: ${response.status}` }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();

    // Extract with JSON-LD first (most reliable), then OG tags
    const jsonLdData = extractFromJsonLd(html);
    const metaData = extractFromHtml(html);

    // Merge: JSON-LD takes priority
    const name = jsonLdData.name || metaData.name || shopName;
    const description = jsonLdData.description || metaData.description || null;
    const price = jsonLdData.price || metaData.price || null;
    const imageUrl = jsonLdData.imageUrl || metaData.imageUrl || null;

    return new Response(JSON.stringify({
      name,
      description,
      price,
      imageUrl,
      shopName,
      originalUrl: url,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
