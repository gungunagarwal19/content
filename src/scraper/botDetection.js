const axios = require('axios');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getDefaultHeaders(referer = '') {
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1'
  };
  if (referer) {
    headers['Referer'] = referer;
  }
  return headers;
}

function analyzeBotBlocking(status, html = '') {
  if (status === 403 || status === 429 || status === 503) {
    const lower = (html || '').toLowerCase();
    if (lower.includes('cloudflare') || lower.includes('just a moment') || lower.includes('cf-browser-verification')) {
      return { isBlocked: true, reason: 'Cloudflare challenge', status };
    }
    if (lower.includes('perimeterx') || lower.includes('px-captcha') || lower.includes('access denied')) {
      return { isBlocked: true, reason: 'WAF access denied', status };
    }
    if (lower.includes('incapsula') || lower.includes('_incapsula_resource')) {
      return { isBlocked: true, reason: 'Incapsula bot protection', status };
    }
    if (status === 429) {
      return { isBlocked: true, reason: 'Rate limited (429)', status };
    }
    return { isBlocked: true, reason: `HTTP ${status} forbidden`, status };
  }
  return { isBlocked: false, reason: null, status };
}

async function safeFetch(url, options = {}) {
  const timeout = options.timeout || 12000;
  const referer = options.referer || '';
  
  try {
    const response = await axios.get(url, {
      headers: getDefaultHeaders(referer),
      timeout,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400
    });

    return {
      success: true,
      data: response.data,
      status: response.status,
      headers: response.headers,
      url: response.request?.res?.responseUrl || url
    };
  } catch (err) {
    const status = err.response?.status || null;
    const responseData = typeof err.response?.data === 'string' ? err.response?.data : '';
    const blockAnalysis = analyzeBotBlocking(status, responseData);

    return {
      success: false,
      data: null,
      status,
      error: err.message,
      isBlocked: blockAnalysis.isBlocked,
      blockReason: blockAnalysis.reason
    };
  }
}

module.exports = {
  getDefaultHeaders,
  getRandomUserAgent,
  analyzeBotBlocking,
  safeFetch
};
