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

function getGoogleTranslateProxyUrl(originalUrl: string): string {
  try {
    const parsed = new URL(originalUrl);
    const hostWithDashes = parsed.hostname.replace(/\./g, '-');
    const proxyHost = `${hostWithDashes}.translate.goog`;
    const proxyUrl = new URL(parsed.pathname + parsed.search, `https://${proxyHost}`);
    proxyUrl.searchParams.set('_x_tr_sl', 'auto');
    proxyUrl.searchParams.set('_x_tr_tl', 'pl');
    proxyUrl.searchParams.set('_x_tr_hl', 'pl');
    return proxyUrl.toString();
  } catch {
    return originalUrl;
  }
}

function extractAllegroOfferId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/-(\d+)(?:\/)?$/) || parsed.pathname.match(/\/(\d+)(?:\/)?$/);
    if (match) return match[1];
    
    const idParam = parsed.searchParams.get('id') || parsed.searchParams.get('item');
    if (idParam && /^\d+$/.test(idParam)) return idParam;
    
    return null;
  } catch {
    return null;
  }
}

function cleanTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/^Kup teraz na Allegro\.pl\s+za\s+[\d\s,.]+\s*(?:zł|PLN)\s*-\s*/i, '')
    .replace(/^Kup teraz za\s+[\d\s,.]+\s*(?:zł|PLN)\s*-\s*/i, '')
    .replace(/\s*[\.-]\s*Allegro\.pl.*$/i, '')
    .replace(/\s*\|\s*Allegro\.pl.*$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim();
}

function getSlugName(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    let last = parts[parts.length - 1] || parts[parts.length - 2] || '';
    last = last.replace(/-?\d+$/, '');
    const words = last.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
    return words || 'Allegro Przedmiot';
  } catch {
    return 'Allegro Przedmiot';
  }
}

async function doFetch(targetUrl: string): Promise<Response> {
  return await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });
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
      /"originalPrice"\s*:\s*"([\d]+[,.]?[\d]*)"/,
      /"priceAmount"\s*:\s*"([\d]+[,.]?[\d]*)"/,
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
    const isEmpik = shopName.endsWith('empik.com');
    const isAllegro = shopName.endsWith('allegro.pl');

    if (isAllegro) {
      const offerId = extractAllegroOfferId(url);
      if (!offerId) {
        return new Response(JSON.stringify({
          name: getSlugName(url),
          description: 'Przedmiot z Allegro',
          price: null,
          imageUrl: null,
          shopName,
          originalUrl: url,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(offerId)}`;
        const ddgRes = await fetch(ddgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          signal: AbortSignal.timeout(6000),
        });

        if (!ddgRes.ok) {
          throw new Error(`DDG status: ${ddgRes.status}`);
        }

        const html = await ddgRes.text();
        const resultBlockRegex = /<div class="[^"]*result[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
        let match;
        
        let name = null;
        let price = null;
        let firstResultText = null;

        while ((match = resultBlockRegex.exec(html)) !== null) {
          const block = match[1];
          const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
                               block.match(/<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
          const titleMatch = block.match(/<a class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
          const textToSearch = (titleMatch ? titleMatch[1] : '') + ' ' + (snippetMatch ? snippetMatch[1] : '');
          const cleanText = textToSearch.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          
          if (!firstResultText) {
            firstResultText = cleanText;
          }

          const allegroPattern = /za\s+([\d\s,]+)\s*(?:zł|PLN)\s*-\s*([\s\S]+?)(?:\(\d+\)|\.\s*Allegro|$)/i;
          const allegroMatch = allegroPattern.exec(cleanText);
          
          if (allegroMatch) {
            const rawPrice = allegroMatch[1];
            const rawName = allegroMatch[2];
            price = rawPrice.replace(/[^\d,.]/g, '').replace(',', '.').trim();
            const num = parseFloat(price);
            price = isNaN(num) ? null : num.toFixed(2);
            name = rawName.trim().replace(/\s*\(\d+\)$/, '').trim();
            break;
          }
        }

        if (!name && firstResultText) {
          name = cleanTitle(firstResultText);
        }
        
        if (!name) {
          name = getSlugName(url);
        }

        return new Response(JSON.stringify({
          name,
          description: `Oferta Allegro o ID: ${offerId}`,
          price,
          imageUrl: null,
          shopName,
          originalUrl: url,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (err) {
        return new Response(JSON.stringify({
          name: getSlugName(url),
          description: `Oferta Allegro o ID: ${offerId}`,
          price: null,
          imageUrl: null,
          shopName,
          originalUrl: url,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let fetchUrl = parsedUrl.toString();
    
    if (isEmpik) {
      fetchUrl = getGoogleTranslateProxyUrl(fetchUrl);
    }

    let response: Response;
    const maxRetries = 2;

    async function fetchWithRetry(target: string, retries: number): Promise<Response> {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const res = await doFetch(target);
          if (res.ok) return res;
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          } else {
            return res;
          }
        } catch (err) {
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          } else {
            throw err;
          }
        }
      }
      throw new Error("Failed after retries");
    }

    if (isEmpik) {
      try {
        response = await fetchWithRetry(fetchUrl, maxRetries);
        if (!response.ok) {
          const directRes = await doFetch(parsedUrl.toString());
          if (directRes.ok) {
            response = directRes;
          }
        }
      } catch (err) {
        response = await doFetch(parsedUrl.toString());
      }
    } else {
      try {
        response = await doFetch(fetchUrl);
        if (!response.ok) {
          const proxyUrl = getGoogleTranslateProxyUrl(parsedUrl.toString());
          response = await fetchWithRetry(proxyUrl, maxRetries);
        }
      } catch (err) {
        const proxyUrl = getGoogleTranslateProxyUrl(parsedUrl.toString());
        response = await fetchWithRetry(proxyUrl, maxRetries);
      }
    }

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch (e) {
        bodyText = "Could not read body: " + String(e);
      }
      return new Response(JSON.stringify({ 
        error: `Failed to fetch URL: ${response.status}`,
        status: response.status,
        bodySnippet: bodyText.slice(0, 1000)
      }), {
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
