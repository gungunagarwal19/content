const store = require('./db/store');
const { crawlCompetitor } = require('./scraper/crawler');
const { checkCompetitorPricing } = require('./scraper/pricingTracker');
const { enrichKeywordData } = require('./enrichment/keywordEnricher');
const { sendSlackAlert } = require('./notifier/slackNotifier');
const { cleanDomain } = require('./utils/normalizer');

async function runScan(rawDomain, options = {}) {
  const domain = cleanDomain(rawDomain);
  const settings = store.getSettings();

  let competitor = store.getCompetitor(domain);
  if (!competitor) {
    competitor = store.saveCompetitor({
      domain,
      name: domain
    });
  }

  const existingPosts = store.getPostsByDomain(domain);
  const isFirstRun = existingPosts.length === 0;

  const scanRun = store.addScanRun({
    competitorId: competitor.id,
    domain,
    status: 'IN_PROGRESS',
    isFirstRun,
    logs: []
  });

  const appendLog = (logItem) => {
    scanRun.logs.push(logItem);
    store.updateScanRun(scanRun.id, { logs: scanRun.logs });
    if (options.onLog) options.onLog(logItem);
  };

  appendLog({
    message: `Scan started for ${domain}. Mode: ${isFirstRun ? 'Baseline' : 'Differential'}`,
    level: 'info',
    timestamp: new Date().toISOString()
  });

  try {
    const crawlResult = await crawlCompetitor(domain, { onLog: appendLog });

    if (!crawlResult.success) {
      store.updateScanRun(scanRun.id, {
        status: 'FAILED',
        error: crawlResult.error,
        completedAt: new Date().toISOString()
      });
      return {
        success: false,
        domain,
        scanRunId: scanRun.id,
        isBlocked: crawlResult.isBlocked,
        blockReason: crawlResult.blockReason,
        error: crawlResult.error,
        logs: scanRun.logs
      };
    }

    if (!crawlResult.hasBlog || crawlResult.posts.length === 0) {
      appendLog({
        message: 'No blog section or published articles found.',
        level: 'warn',
        timestamp: new Date().toISOString()
      });

      store.updateScanRun(scanRun.id, {
        status: 'COMPLETED_NO_BLOG',
        postsFound: 0,
        newPostsCount: 0,
        completedAt: new Date().toISOString()
      });

      return {
        success: true,
        domain,
        hasBlog: false,
        scanRunId: scanRun.id,
        message: 'No blog found on this domain.',
        newPosts: [],
        pricingDiff: null,
        logs: scanRun.logs
      };
    }

    const newPostsDiscovered = [];
    const allStoredPosts = [];

    for (const post of crawlResult.posts) {
      const existing = store.getPostByUrl(post.url);
      if (!existing) {
        newPostsDiscovered.push(post);
      } else {
        allStoredPosts.push(existing);
      }
    }

    appendLog({
      message: isFirstRun
        ? `Baseline saved (${crawlResult.posts.length} posts).`
        : `Differential check: ${newPostsDiscovered.length} new post(s) found.`,
      level: 'info',
      timestamp: new Date().toISOString()
    });

    const postsToEnrich = isFirstRun
      ? crawlResult.posts.slice(0, 5)
      : newPostsDiscovered;

    const enrichedPosts = [];
    for (const p of postsToEnrich) {
      const keywordCandidate = p.targetKeyword || p.keyword || 'competitor intelligence';
      const enrichment = await enrichKeywordData(keywordCandidate, settings);

      const enriched = {
        ...p,
        competitorId: competitor.id,
        domain,
        targetKeyword: enrichment.keyword,
        searchVolume: enrichment.searchVolume,
        cpc: enrichment.cpc,
        competition: enrichment.competition,
        keywordSource: enrichment.source,
        keywordApiNotice: enrichment.apiNotice,
        isBaseline: isFirstRun,
        runId: scanRun.id
      };

      store.savePost(enriched);
      enrichedPosts.push(enriched);

      appendLog({
        message: `Enriched: "${p.title.slice(0, 40)}..." -> [${enrichment.keyword}] Vol: ${enrichment.searchVolume}/mo`,
        level: 'info',
        timestamp: new Date().toISOString()
      });
    }

    if (isFirstRun && crawlResult.posts.length > 5) {
      for (const p of crawlResult.posts.slice(5)) {
        store.savePost({
          ...p,
          competitorId: competitor.id,
          domain,
          targetKeyword: p.targetKeyword || 'competitor post',
          searchVolume: 500,
          cpc: 1.20,
          competition: 'MEDIUM',
          keywordSource: 'Baseline Default',
          isBaseline: true,
          runId: scanRun.id
        });
      }
    }

    const previousPricing = store.getLatestPricing(domain);
    const pricingResult = await checkCompetitorPricing(domain, previousPricing, crawlResult.homepageHtml);

    let pricingDiff = null;
    if (pricingResult.success) {
      pricingDiff = pricingResult.diff;
      store.savePricingSnapshot({
        competitorId: competitor.id,
        domain,
        pricingUrl: pricingResult.pricingUrl,
        plans: pricingResult.currentPricing.plans,
        rawHash: pricingResult.currentPricing.rawHash,
        plansCount: pricingResult.currentPricing.plansCount,
        hasChanged: pricingDiff.hasChanged,
        changes: pricingDiff.changes
      });

      appendLog({
        message: pricingDiff.hasChanged ? `Pricing update: ${pricingDiff.summary}` : 'Pricing unchanged.',
        level: pricingDiff.hasChanged ? 'warn' : 'info',
        timestamp: new Date().toISOString()
      });
    }

    const postsForAlert = isFirstRun ? enrichedPosts.slice(0, 3) : enrichedPosts;
    const shouldSendAlert = (!isFirstRun && (postsForAlert.length > 0 || (pricingDiff && pricingDiff.hasChanged))) ||
      (isFirstRun && options.sendAlertOnBaseline);

    let slackResult = null;

    if (shouldSendAlert) {
      appendLog({
        message: `Dispatching Slack alert for ${domain}...`,
        level: 'info',
        timestamp: new Date().toISOString()
      });

      slackResult = await sendSlackAlert(domain, postsForAlert, pricingDiff);
      appendLog({
        message: slackResult.success
          ? 'Slack alert sent successfully.'
          : `Slack alert: ${slackResult.message || slackResult.error}`,
        level: slackResult.success ? 'success' : 'warn',
        timestamp: new Date().toISOString()
      });
    }

    const totalCurrentPosts = store.getPostsByDomain(domain).length;
    store.saveCompetitor({
      id: competitor.id,
      domain,
      lastScannedAt: new Date().toISOString(),
      scanCount: (competitor.scanCount || 0) + 1,
      totalPosts: totalCurrentPosts
    });

    store.updateScanRun(scanRun.id, {
      status: 'COMPLETED',
      postsFound: crawlResult.posts.length,
      newPostsCount: isFirstRun ? 0 : newPostsDiscovered.length,
      pricingChanged: Boolean(pricingDiff?.hasChanged),
      alertSent: shouldSendAlert,
      completedAt: new Date().toISOString()
    });

    return {
      success: true,
      domain,
      isFirstRun,
      scanRunId: scanRun.id,
      hasBlog: true,
      totalScraped: crawlResult.posts.length,
      newPostsCount: isFirstRun ? 0 : newPostsDiscovered.length,
      newPosts: enrichedPosts,
      pricingDiff,
      slackResult,
      logs: scanRun.logs
    };

  } catch (err) {
    appendLog({
      message: `Scan failure: ${err.message}`,
      level: 'error',
      timestamp: new Date().toISOString()
    });

    store.updateScanRun(scanRun.id, {
      status: 'ERROR',
      error: err.message,
      completedAt: new Date().toISOString()
    });

    return {
      success: false,
      domain,
      scanRunId: scanRun.id,
      error: err.message,
      logs: scanRun.logs
    };
  }
}

module.exports = {
  runScan
};
