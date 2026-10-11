// Gemini API プロキシ (Cloudflare Workers)
// Secret(必須): GEMINI_API_KEY
// Vars(任意): ALLOWED_ORIGINS, ALLOWED_MODELS (カンマ区切り) / Binding(任意): LIMITER, ASSETS
const UP = 'https://generativelanguage.googleapis.com';
const PATH = /^\/v1beta\/models\/([\w.\-]+):(generateContent|streamGenerateContent)$/;
const list = v => (v || '').split(',').map(s => s.trim()).filter(Boolean);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const isApi = PATH.test(url.pathname);
    if (!isApi && req.method === 'GET') {
      return env.ASSETS.fetch(req);
    }
    if (!isApi) {
      return new Response('method not allowed', {status:405});
    }
    // API request: extract origin info
    const origin = req.headers.get('Origin') || '';
    const origins = list(env.ALLOWED_ORIGINS);
    const originAllowed = origins.length && origins.includes(origin);
    // OPTIONS
    if (req.method === 'OPTIONS') {
      if (originAllowed) {
        const cors = {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
        };
        return new Response(null, {status:204, headers:cors});
      } else {
        return new Response('forbidden', {status:403});
      }
    }
    // METHOD
    if (req.method !== 'POST') {
      if (originAllowed) {
        return new Response(JSON.stringify({error:{message:'method not allowed'}}), {
          status:405,
          headers: {
            'Content-Type':'application/json',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Max-Age': '86400',
          }
        });
      } else {
        return new Response('forbidden', {status:403});
      }
    }
    // RATE LIMIT
    if (!env.LIMITER) {
      const errBody = JSON.stringify({error:{message:'rate limiter is not bound'}});
      const headers = {
        'Content-Type':'application/json',
      };
      if (originAllowed) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
        headers['Access-Control-Max-Age'] = '86400';
      }
      return new Response(errBody, {status:500, headers});
    }
    const ip = req.headers.get('CF-Connecting-IP');
    if (!ip) {
      const errBody = JSON.stringify({error:{message:'rate limited'}});
      const headers = {
        'Content-Type':'application/json',
        'Retry-After':'60',
      };
      if (originAllowed) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
        headers['Access-Control-Max-Age'] = '86400';
      }
      return new Response(errBody, {status:429, headers});
    }
    const {success} = await env.LIMITER.limit({key: ip});
    if (!success) {
      const errBody = JSON.stringify({error:{message:'rate limited'}});
      const headers = {
        'Content-Type':'application/json',
        'Retry-After':'60',
      };
      if (originAllowed) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
        headers['Access-Control-Max-Age'] = '86400';
      }
      return new Response(errBody, {status:429, headers});
    }
    // ORIGIN validation (redundant but keep)
    if (!originAllowed) {
      return new Response('forbidden', {status:403});
    }
    // MODEL validation
    const m = PATH.exec(url.pathname);
    if (!m) {
      return new Response(JSON.stringify({error:{message:'not found'}}), {
        status:404,
        headers: {
          'Content-Type':'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    const models = list(env.ALLOWED_MODELS);
    if (models.length === 0) {
      return new Response(JSON.stringify({error:{message:'model not allowed'}}), {
        status:403,
        headers: {
          'Content-Type':'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    if (!models.includes(m[1])) {
      return new Response(JSON.stringify({error:{message:'model not allowed'}}), {
        status:403,
        headers: {
          'Content-Type':'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
        }
        }
      );
    }
    // PAYLOAD SIZE
    const body = await req.text();
    if (body.length > 262144) {
      return new Response(JSON.stringify({error:{message:'payload too large'}}), {
        status:413,
        headers: {
          'Content-Type':'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
        }
        }
      );
    }
    // UPSTREAM
    try {
      const up = await fetch(UP + url.pathname + (url.searchParams.get('alt') === 'sse' ? '?alt=sse' : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body,
      });
      const cors = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
      };
      return new Response(up.body, {
        status: up.status,
        headers: {
          ...cors,
          'Content-Type': up.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({error:{message:'upstream error'}}), {
        status:502,
        headers: {
          'Content-Type':'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
        }
        }
      );
    }
  },
};
