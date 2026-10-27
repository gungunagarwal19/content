const { URL } = require('url');

function cleanDomain(input) {
  if (!input) return '';
  let str = input.trim().toLowerCase();
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }
  try {
    const parsed = new URL(str);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return input.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();
  }
}

function normalizeUrl(targetUrl, baseUrl) {
  if (!targetUrl) return null;
  try {
    const trimmed = targetUrl.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
      return null;
    }

    const resolved = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }

    const searchParams = resolved.searchParams;
    const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'fbclid', 'gclid'];
    trackingKeys.forEach(key => searchParams.delete(key));

    resolved.hash = '';

    let pathname = resolved.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    resolved.pathname = pathname;

    return resolved.toString();
  } catch (err) {
    return null;
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch (e) {}

  const relativeMatch = String(dateStr).match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const now = new Date();
    if (unit === 'minute') now.setMinutes(now.getMinutes() - amount);
    else if (unit === 'hour') now.setHours(now.getHours() - amount);
    else if (unit === 'day') now.setDate(now.getDate() - amount);
    else if (unit === 'week') now.setDate(now.getDate() - amount * 7);
    else if (unit === 'month') now.setMonth(now.getMonth() - amount);
    else if (unit === 'year') now.setFullYear(now.getFullYear() - amount);
    return now.toISOString();
  }

  return null;
}

function extractKeywordCandidate(url, title = '', metaKeywords = '') {
  if (metaKeywords && metaKeywords.trim().length > 0) {
    const firstMeta = metaKeywords.split(',')[0].trim();
    if (firstMeta.length > 2) return firstMeta;
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || '';
    
    let cleanSlug = lastSegment
      .replace(/\.(html|php|asp)$/i, '')
      .replace(/^\d+[-_]/, '')
      .replace(/[-_]+/g, ' ')
      .trim();

    const genericWords = ['blog', 'posts', 'post', 'article', 'articles', 'news', 'index', 'page'];
    if (cleanSlug && !genericWords.includes(cleanSlug.toLowerCase()) && cleanSlug.length > 3) {
      const words = cleanSlug.split(/\s+/).slice(0, 5);
      return words.join(' ').toLowerCase();
    }
  } catch (e) {}

  if (title) {
    const cleanTitle = title
      .split(/[|\-–—:]/)[0]
      .replace(/[^\w\s]/g, '')
      .trim();
    const words = cleanTitle.split(/\s+/).filter(w => w.length > 2).slice(0, 4);
    if (words.length > 0) {
      return words.join(' ').toLowerCase();
    }
  }

  return 'competitor analysis';
}

module.exports = {
  cleanDomain,
  normalizeUrl,
  parseDate,
  extractKeywordCandidate
};
