const cheerio = require('cheerio');
const { parseDate, extractKeywordCandidate } = require('../utils/normalizer');

const NON_BLOG_PREFIXES = [
  '/solutions',
  '/solution',
  '/features',
  '/feature',
  '/product',
  '/products',
  '/integrations',
  '/integration',
  '/apps',
  '/app',
  '/templates',
  '/template',
  '/pricing',
  '/plans',
  '/enterprise',
  '/security',
  '/compliance',
  '/legal',
  '/privacy',
  '/terms',
  '/cookies',
  '/about',
  '/about-us',
  '/careers',
  '/jobs',
  '/contact',
  '/contact-us',
  '/support',
  '/help',
  '/docs',
  '/documentation',
  '/api',
  '/developer',
  '/developers',
  '/login',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/register',
  '/auth',
  '/demo',
  '/compare',
  '/comparison',
  '/customers',
  '/case-studies',
  '/partners',
  '/press/kit',
  '/downloads',
  '/download'
];

function isNonArticleUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, '');

    if (pathname === '' || pathname === '/') return true;

    for (const prefix of NON_BLOG_PREFIXES) {
      if (pathname === prefix || pathname.startsWith(prefix + '/')) {
        return true;
      }
    }

    if (
      pathname.includes('/category/') ||
      pathname.includes('/categories/') ||
      pathname.includes('/tag/') ||
      pathname.includes('/tags/') ||
      pathname.includes('/author/') ||
      pathname.includes('/page/') ||
      pathname.includes('/search')
    ) {
      return true;
    }

    return false;
  } catch (e) {
    return true;
  }
}

function verifyArticlePage($, url) {
  if (isNonArticleUrl(url)) {
    return { isArticle: false };
  }

  let hasArticleSchema = false;
  let hasMarketingOnlySchema = false;
  let jsonLdHeadline = null;
  let jsonLdDate = null;
  let jsonLdDesc = null;
  let jsonLdKeywords = null;

  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const text = $(elem).text().trim();
      if (!text) return;
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);

      for (const item of items) {
        const type = (item['@type'] || '').toLowerCase();
        
        if (
          type === 'article' ||
          type === 'blogposting' ||
          type === 'newsarticle' ||
          type === 'techarticle' ||
          type === 'scholarlyarticle' ||
          type.includes('posting')
        ) {
          hasArticleSchema = true;
          if (!jsonLdHeadline && item.headline) jsonLdHeadline = item.headline;
          if (!jsonLdDate && (item.datePublished || item.dateModified || item.dateCreated)) {
            jsonLdDate = item.datePublished || item.dateModified || item.dateCreated;
          }
          if (!jsonLdDesc && item.description) jsonLdDesc = item.description;
          if (!jsonLdKeywords && item.keywords) {
            jsonLdKeywords = Array.isArray(item.keywords) ? item.keywords.join(', ') : item.keywords;
          }
        }

        if (type === 'softwareapplication' || type === 'product' || type === 'faqpage' || type === 'service') {
          hasMarketingOnlySchema = true;
        }
      }
    } catch (e) {}
  });

  if (hasArticleSchema) {
    return {
      isArticle: true,
      jsonLdData: { headline: jsonLdHeadline, date: jsonLdDate, desc: jsonLdDesc, keywords: jsonLdKeywords }
    };
  }

  const pathname = new URL(url).pathname.toLowerCase();
  const isUnderBlogPath = pathname.startsWith('/blog/') ||
    pathname.startsWith('/articles/') ||
    pathname.startsWith('/posts/') ||
    pathname.startsWith('/news/') ||
    pathname.startsWith('/insights/') ||
    pathname.startsWith('/updates/') ||
    url.includes('blog.');

  if (hasMarketingOnlySchema && !isUnderBlogPath) {
    return { isArticle: false };
  }

  const ogType = ($('meta[property="og:type"]').attr('content') || '').toLowerCase();
  if (ogType === 'article') {
    return { isArticle: true, jsonLdData: null };
  }

  const pubTimeMeta = $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="publish-date"]').attr('content') ||
    $('meta[name="pubdate"]').attr('content') ||
    $('time[datetime]').attr('datetime');

  if (isUnderBlogPath) {
    const hasArticleTag = $('article').length > 0;
    const hasHeadings = $('h1').length > 0;
    const paragraphCount = $('article p, main p, p').length;

    if ((hasArticleTag || pubTimeMeta || hasHeadings) && paragraphCount >= 2) {
      return { isArticle: true, jsonLdData: null };
    }
  }

  return { isArticle: false };
}

function extractArticleDetails(html, url) {
  if (!html || typeof html !== 'string') return null;

  const $ = cheerio.load(html);
  const verification = verifyArticlePage($, url);

  if (!verification.isArticle) return null;

  const jsonLd = verification.jsonLdData || {};

  let title = jsonLd.headline ||
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    '';

  title = title.replace(/\s+/g, ' ').trim();

  let rawDate = jsonLd.date ||
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="publish-date"]').attr('content') ||
    $('meta[name="pubdate"]').attr('content') ||
    $('time[datetime]').attr('datetime') ||
    $('time').first().text().trim() ||
    $('[class*="publish"], [class*="date"], [class*="posted"]').first().text().trim() ||
    null;

  let publishDate = parseDate(rawDate) || new Date().toISOString();

  let metaDescription = jsonLd.desc ||
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    $('article p').first().text().trim() ||
    $('main p').first().text().trim() ||
    $('p').first().text().trim() ||
    '';

  metaDescription = metaDescription.replace(/\s+/g, ' ').trim();
  if (metaDescription.length > 280) {
    metaDescription = metaDescription.slice(0, 277) + '...';
  }

  const metaKeywords = jsonLd.keywords || $('meta[name="keywords"]').attr('content') || '';
  const targetKeyword = extractKeywordCandidate(url, title, metaKeywords);

  return {
    url,
    title: title || 'Untitled Article',
    publishDate,
    metaDescription: metaDescription || 'No description provided.',
    targetKeyword
  };
}

module.exports = {
  isNonArticleUrl,
  verifyArticlePage,
  extractArticleDetails
};
