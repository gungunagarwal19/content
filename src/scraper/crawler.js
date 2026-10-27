const cheerio = require('cheerio');
const xml2js = require('xml2js');
const { safeFetch } = require('./botDetection');
const { extractArticleDetails, isNonArticleUrl } = require('./articleExtractor');
const { normalizeUrl, cleanDomain, parseDate } = require('../utils/normalizer');

const BLOG_PATH_CANDIDATES = [
  '/blog',
  '/resources',
  '/articles',
  '/news',
  '/insights'
];

const RSS_PATH_CANDIDATES = [
  '/feed',
  '/blog/feed',
  '/rss.xml',
  '/blog/rss.xml',
  '/feed.xml',
  '/rss',
  '/blog/rss',
  '/atom.xml'
];

async function parseRssOrAtom(xmlContent, baseUrl) {
  try {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(xmlContent);
    const articles = [];

    if (result.rss && result.rss.channel && result.rss.channel.item) {
      const items = Array.isArray(result.rss.channel.item)
        ? result.rss.channel.item
        : [result.rss.channel.item];

      for (const item of items) {
        let rawLink = typeof item.link === 'string' ? item.link : (item.link?._ || item.guid?._ || item.guid);
        const link = normalizeUrl(rawLink, baseUrl);
        if (!link || isNonArticleUrl(link)) continue;

        const title = typeof item.title === 'string' ? item.title : (item.title?._ || '');
        const pubDate = parseDate(item.pubDate || item.date || item['dc:date']);
        let desc = item.description || item['content:encoded'] || '';
        if (typeof desc !== 'string') desc = desc._ || '';
        const cleanDesc = desc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 280);

        articles.push({
          url: link,
          title: title.trim(),
          publishDate: pubDate || new Date().toISOString(),
          metaDescription: cleanDesc || '',
          source: 'RSS'
        });
      }
      return articles;
    }

    if (result.feed && result.feed.entry) {
      const entries = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
      for (const entry of entries) {
        let rawLink = '';
        if (entry.link) {
          if (Array.isArray(entry.link)) {
            const alt = entry.link.find(l => l.$?.rel === 'alternate') || entry.link[0];
            rawLink = alt.$?.href || '';
          } else {
            rawLink = entry.link.$?.href || entry.link;
          }
        }
        const link = normalizeUrl(rawLink, baseUrl);
        if (!link || isNonArticleUrl(link)) continue;

        const title = typeof entry.title === 'string' ? entry.title : (entry.title?._ || '');
        const pubDate = parseDate(entry.published || entry.updated);
        let summary = entry.summary || entry.content || '';
        if (typeof summary !== 'string') summary = summary._ || '';
        const cleanSummary = summary.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 280);

        articles.push({
          url: link,
          title: title.trim(),
          publishDate: pubDate || new Date().toISOString(),
          metaDescription: cleanSummary || '',
          source: 'Atom'
        });
      }
      return articles;
    }

    return [];
  } catch (err) {
    return [];
  }
}

async function crawlCompetitor(domain, options = {}) {
  const onLog = options.onLog || (() => {});
  const logger = (msg, level = 'info') => {
    onLog({ message: msg, level, timestamp: new Date().toISOString() });
  };

  const clean = cleanDomain(domain);
  const baseUrl = `https://${clean}`;
  logger(`Scanning ${clean}`);

  let homeRes = await safeFetch(baseUrl);
  if (!homeRes.success) {
    homeRes = await safeFetch(`http://${clean}`);
  }

  if (!homeRes.success) {
    if (homeRes.isBlocked) {
      return {
        success: false,
        domain: clean,
        isBlocked: true,
        blockReason: homeRes.blockReason,
        posts: [],
        hasBlog: false,
        error: `Access restricted by target site (${homeRes.blockReason})`
      };
    }
    return {
      success: false,
      domain: clean,
      isBlocked: false,
      posts: [],
      hasBlog: false,
      error: `Could not reach ${clean}: ${homeRes.error}`
    };
  }

  const homepageHtml = homeRes.data;
  const $home = cheerio.load(homepageHtml);

  const discoveredBlogUrls = new Set();
  const discoveredRssUrls = new Set();

  $home('link[rel="alternate"]').each((_, el) => {
    const type = $home(el).attr('type') || '';
    const href = $home(el).attr('href');
    if ((type.includes('rss') || type.includes('atom') || type.includes('xml')) && href) {
      const fullRss = normalizeUrl(href, baseUrl);
      if (fullRss) discoveredRssUrls.add(fullRss);
    }
  });

  $home('a[href]').each((_, el) => {
    const href = $home(el).attr('href');
    const text = $home(el).text().toLowerCase().trim();
    if (!href) return;

    if (
      text === 'blog' ||
      text === 'articles' ||
      text === 'resources' ||
      text === 'news' ||
      text === 'insights' ||
      href.match(/\/blog(\/|$)/i) ||
      href.match(/\/resources(\/|$)/i) ||
      href.match(/\/articles(\/|$)/i) ||
      href.match(/\/news(\/|$)/i)
    ) {
      const fullUrl = normalizeUrl(href, baseUrl);
      if (fullUrl && fullUrl.includes(clean) && !isNonArticleUrl(fullUrl)) {
        discoveredBlogUrls.add(fullUrl);
      }
    }
  });

  const blogSubdomain = `https://blog.${clean}`;
  if (discoveredBlogUrls.size === 0) {
    for (const path of BLOG_PATH_CANDIDATES) {
      discoveredBlogUrls.add(`${baseUrl}${path}`);
    }
    discoveredBlogUrls.add(blogSubdomain);
  }

  for (const path of RSS_PATH_CANDIDATES) {
    discoveredRssUrls.add(`${baseUrl}${path}`);
  }
  discoveredRssUrls.add(`https://blog.${clean}/feed`);
  discoveredRssUrls.add(`https://blog.${clean}/rss.xml`);

  let feedArticles = [];
  for (const rssUrl of Array.from(discoveredRssUrls).slice(0, 4)) {
    const rssRes = await safeFetch(rssUrl, { referer: baseUrl, timeout: 6000 });
    if (rssRes.success && typeof rssRes.data === 'string' && (rssRes.data.includes('<rss') || rssRes.data.includes('<feed') || rssRes.data.includes('<?xml'))) {
      const parsed = await parseRssOrAtom(rssRes.data, baseUrl);
      if (parsed.length > 0) {
        feedArticles = parsed;
        break;
      }
    }
  }

  const candidateArticleUrls = new Set();
  const blogListUrls = Array.from(discoveredBlogUrls).slice(0, 5);

  for (const blogUrl of blogListUrls) {
    const blogRes = await safeFetch(blogUrl, { referer: baseUrl });
    if (blogRes.success) {
      const $blog = cheerio.load(blogRes.data);

      $blog('a[href]').each((_, el) => {
        const href = $blog(el).attr('href');
        const normalized = normalizeUrl(href, blogUrl);

        if (!normalized || !normalized.includes(clean)) return;
        if (isNonArticleUrl(normalized)) return;

        const path = new URL(normalized).pathname;
        const isBlogChild = path.startsWith('/blog/') ||
          path.startsWith('/resources/') ||
          path.startsWith('/articles/') ||
          path.startsWith('/news/') ||
          path.startsWith('/insights/') ||
          path.startsWith('/updates/') ||
          normalized.includes('blog.');

        const hasDatePattern = /\/\d{4}\/\d{2}\//.test(path);
        const segments = path.split('/').filter(Boolean);

        if ((isBlogChild || hasDatePattern) && segments.length >= 2) {
          candidateArticleUrls.add(normalized);
        }
      });

      if (candidateArticleUrls.size > 0) break;
    }
  }

  const allArticleMap = new Map();
  for (const art of feedArticles) {
    allArticleMap.set(art.url, art);
  }

  const urlsToVerify = Array.from(candidateArticleUrls)
    .filter(url => !allArticleMap.has(url))
    .slice(0, 10);

  if (urlsToVerify.length > 0) {
    for (const postUrl of urlsToVerify) {
      try {
        const artRes = await safeFetch(postUrl, { referer: baseUrl, timeout: 8000 });
        if (artRes.success) {
          const details = extractArticleDetails(artRes.data, postUrl);
          if (details) {
            allArticleMap.set(postUrl, details);
          }
        }
      } catch (err) {}
    }
  }

  const finalPosts = Array.from(allArticleMap.values());

  if (finalPosts.length === 0) {
    return {
      success: true,
      domain: clean,
      hasBlog: false,
      message: 'No active blog or editorial posts detected on this domain.',
      posts: [],
      homepageHtml
    };
  }

  return {
    success: true,
    domain: clean,
    hasBlog: true,
    posts: finalPosts,
    homepageHtml
  };
}

module.exports = {
  crawlCompetitor,
  parseRssOrAtom
};
