const cheerio = require('cheerio');
const crypto = require('crypto');
const { safeFetch } = require('./botDetection');
const { normalizeUrl } = require('../utils/normalizer');

async function discoverPricingUrl(domain, homepageHtml = '', baseUrl = '') {
  if (homepageHtml) {
    const $ = cheerio.load(homepageHtml);
    let candidate = null;

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase().trim();
      if (
        text === 'pricing' ||
        text === 'plans' ||
        text === 'plans & pricing' ||
        href.includes('/pricing') ||
        href.includes('/plans')
      ) {
        const normalized = normalizeUrl(href, baseUrl);
        if (normalized && !candidate) {
          candidate = normalized;
        }
      }
    });

    if (candidate) return candidate;
  }

  return `https://${domain}/pricing`;
}

function parsePricingHtml(html, pricingUrl) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, nav, footer, header').remove();

  const plans = [];
  const cardSelectors = [
    '[class*="pricing-card"]',
    '[class*="pricing-tier"]',
    '[class*="plan-card"]',
    '[class*="price-card"]',
    '[data-testid*="pricing"]',
    '[class*="pricing"] > div',
    '[class*="card"]'
  ];

  let matchedCards = $();
  for (const selector of cardSelectors) {
    const found = $(selector);
    if (found.length >= 2 && found.length <= 8) {
      matchedCards = found;
      break;
    }
  }

  if (matchedCards.length > 0) {
    matchedCards.each((i, card) => {
      const $card = $(card);
      const name = $card.find('h2, h3, h4, [class*="title"], [class*="name"]').first().text().trim();
      
      const priceText = $card.find('[class*="price"], [class*="amount"], [class*="cost"]').first().text().trim() ||
        $card.text().match(/([$€£¥]\s*\d+([.,]\d+)?(\s*\/\s*(mo|month|yr|year|user|seat))?|Free|Custom)/i)?.[0] ||
        'Contact Sales';

      const features = [];
      $card.find('li, [class*="feature"]').each((_, feat) => {
        const text = $(feat).text().trim().replace(/\s+/g, ' ');
        if (text.length > 2 && text.length < 150) {
          features.push(text);
        }
      });

      if (name && name.length < 50) {
        plans.push({
          name,
          price: priceText.replace(/\s+/g, ' ').trim(),
          features: features.slice(0, 6)
        });
      }
    });
  }

  const mainText = $('main, [class*="pricing"], body').text().replace(/\s+/g, ' ').trim();
  const rawHash = crypto.createHash('sha256').update(mainText.slice(0, 5000)).digest('hex').substring(0, 16);

  return {
    pricingUrl,
    plans: plans.length > 0 ? plans : [
      { name: 'Standard Pricing Structure', price: 'Detected on Page', features: ['View page for full matrix'] }
    ],
    rawHash,
    plansCount: plans.length
  };
}

function diffPricingSnapshots(previous, current) {
  if (!previous) {
    return {
      hasChanged: false,
      isInitialBaseline: true,
      summary: 'Initial pricing baseline established',
      changes: []
    };
  }

  const changes = [];
  const prevPlans = previous.plans || [];
  const currPlans = current.plans || [];

  for (const curr of currPlans) {
    const prev = prevPlans.find(p => p.name.toLowerCase() === curr.name.toLowerCase());
    if (!prev) {
      changes.push({
        type: 'PLAN_ADDED',
        plan: curr.name,
        details: `New plan introduced: "${curr.name}" (${curr.price})`
      });
    } else if (prev.price !== curr.price) {
      changes.push({
        type: 'PRICE_MODIFIED',
        plan: curr.name,
        details: `Price for "${curr.name}" changed from ${prev.price} to ${curr.price}`
      });
    }
  }

  for (const prev of prevPlans) {
    const stillExists = currPlans.find(p => p.name.toLowerCase() === prev.name.toLowerCase());
    if (!stillExists) {
      changes.push({
        type: 'PLAN_REMOVED',
        plan: prev.name,
        details: `Plan removed: "${prev.name}"`
      });
    }
  }

  if (changes.length === 0 && previous.rawHash !== current.rawHash) {
    changes.push({
      type: 'PRICING_COPY_UPDATED',
      plan: 'General',
      details: 'Pricing terms, features, or promotional text were modified.'
    });
  }

  const hasChanged = changes.length > 0;
  const summary = hasChanged
    ? `Pricing changes detected (${changes.length}): ${changes.map(c => c.details).join('; ')}`
    : 'No pricing changes detected';

  return {
    hasChanged,
    isInitialBaseline: false,
    summary,
    changes
  };
}

async function checkCompetitorPricing(domain, previousSnapshot = null, homepageHtml = '') {
  try {
    const pricingUrl = await discoverPricingUrl(domain, homepageHtml, `https://${domain}`);
    const fetchRes = await safeFetch(pricingUrl, { referer: `https://${domain}` });

    if (!fetchRes.success) {
      return {
        success: false,
        pricingUrl,
        error: fetchRes.error || `HTTP ${fetchRes.status}`,
        isBlocked: fetchRes.isBlocked,
        blockReason: fetchRes.blockReason,
        diff: null
      };
    }

    const currentPricing = parsePricingHtml(fetchRes.data, pricingUrl);
    const diff = diffPricingSnapshots(previousSnapshot, currentPricing);

    return {
      success: true,
      pricingUrl,
      currentPricing,
      diff
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      diff: null
    };
  }
}

module.exports = {
  discoverPricingUrl,
  parsePricingHtml,
  diffPricingSnapshots,
  checkCompetitorPricing
};
