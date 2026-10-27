require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const store = require('./src/db/store');
const { runScan } = require('./src/monitorService');
const { sendSlackAlert } = require('./src/notifier/slackNotifier');
const { enrichKeywordData } = require('./src/enrichment/keywordEnricher');
const { cleanDomain } = require('./src/utils/normalizer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/competitors', (req, res) => {
  const competitors = store.getCompetitors();
  res.json({ success: true, data: competitors });
});

app.post('/api/competitors', (req, res) => {
  const { domain, name } = req.body;
  if (!domain) {
    return res.status(400).json({ success: false, error: 'Domain is required.' });
  }
  const clean = cleanDomain(domain);
  const competitor = store.saveCompetitor({ domain: clean, name: name || clean });
  res.json({ success: true, data: competitor });
});

app.delete('/api/competitors/:id', (req, res) => {
  store.deleteCompetitor(req.params.id);
  res.json({ success: true, message: 'Competitor removed.' });
});

app.post('/api/scan', async (req, res) => {
  const { domain, sendAlertOnBaseline } = req.body;
  if (!domain) {
    return res.status(400).json({ success: false, error: 'Domain is required.' });
  }

  try {
    const result = await runScan(domain, {
      sendAlertOnBaseline: Boolean(sendAlertOnBaseline)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/scan/history', (req, res) => {
  const domain = req.query.domain || null;
  const runs = store.getScanRuns(domain);
  res.json({ success: true, data: runs });
});

app.get('/api/posts', (req, res) => {
  const domain = req.query.domain;
  let posts = domain ? store.getPostsByDomain(cleanDomain(domain)) : store.data.posts;
  posts = [...posts].sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt));
  res.json({ success: true, count: posts.length, data: posts });
});

app.get('/api/pricing/:domain', (req, res) => {
  const domain = cleanDomain(req.params.domain);
  const latest = store.getLatestPricing(domain);
  const allSnapshots = store.data.pricingSnapshots
    .filter(p => p.domain.toLowerCase() === domain.toLowerCase())
    .sort((a, b) => new Date(b.snapshotTime) - new Date(a.snapshotTime));

  res.json({
    success: true,
    data: {
      latest,
      history: allSnapshots
    }
  });
});

app.get('/api/alerts', (req, res) => {
  const alerts = store.getAlerts();
  res.json({ success: true, data: alerts });
});

app.post('/api/alerts/test', async (req, res) => {
  const { webhookUrl } = req.body;
  const samplePosts = [
    {
      title: 'How High-Growth Teams Automate Workflows',
      url: 'https://linear.app/blog',
      publishDate: new Date().toISOString(),
      targetKeyword: 'workflow automation',
      searchVolume: 4400,
      cpc: 3.40,
      metaDescription: 'An overview of automating triage, notifications, and team velocity.'
    }
  ];

  const samplePricingDiff = {
    hasChanged: true,
    changes: [
      { type: 'PRICE_MODIFIED', details: 'Pro Plan updated from $10/user/mo to $12/user/mo' }
    ]
  };

  const result = await sendSlackAlert('demo-competitor.com', samplePosts, samplePricingDiff, webhookUrl);
  return res.json({ success: result.success, data: result });
});

app.get('/api/settings', (req, res) => {
  const settings = store.getSettings();
  res.json({
    success: true,
    data: {
      ...settings,
      dataForSeoPassword: settings.dataForSeoPassword ? '••••••••' : '',
      keywordsEverywhereApiKey: settings.keywordsEverywhereApiKey ? '••••••••' : ''
    }
  });
});

app.post('/api/settings', (req, res) => {
  const updates = req.body;
  if (updates.dataForSeoPassword === '••••••••') delete updates.dataForSeoPassword;
  if (updates.keywordsEverywhereApiKey === '••••••••') delete updates.keywordsEverywhereApiKey;

  const saved = store.updateSettings(updates);
  res.json({ success: true, data: saved });
});

app.post('/api/enrich-test', async (req, res) => {
  const { keyword } = req.body;
  if (!keyword) {
    return res.status(400).json({ success: false, error: 'Keyword required.' });
  }
  const settings = store.getSettings();
  const result = await enrichKeywordData(keyword, settings);
  res.json({ success: true, data: result });
});

app.post('/api/demo/simulate-new-post', async (req, res) => {
  const { domain, title, url } = req.body;
  if (!domain) {
    return res.status(400).json({ success: false, error: 'Domain required' });
  }
  const clean = cleanDomain(domain);
  const comp = store.getCompetitor(clean);
  if (!comp) {
    return res.status(404).json({ success: false, error: 'Competitor not found.' });
  }

  const postTitle = title || `${clean} product update`;
  const postUrl = url || `https://${clean}/blog/update-${Date.now()}`;
  const enrichment = await enrichKeywordData('product update', store.getSettings());

  const saved = store.savePost({
    competitorId: comp.id,
    domain: clean,
    title: postTitle,
    url: postUrl,
    publishDate: new Date().toISOString(),
    metaDescription: 'Simulated article to demonstrate differential alert triggers.',
    targetKeyword: enrichment.keyword,
    searchVolume: enrichment.searchVolume,
    cpc: enrichment.cpc,
    competition: enrichment.competition,
    keywordSource: 'Simulation Demo',
    isBaseline: false,
    firstSeenAt: new Date().toISOString()
  });

  const alertRes = await sendSlackAlert(clean, [saved.post]);

  res.json({
    success: true,
    post: saved.post,
    alert: alertRes
  });
});

cron.schedule('0 8 * * *', async () => {
  const competitors = store.getCompetitors();
  for (const comp of competitors) {
    try {
      await runScan(comp.domain);
    } catch (err) {
      console.error(`Daily scan failed for ${comp.domain}:`, err.message);
    }
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const ALT_PORT = Number(PORT) + 1;
    app.listen(ALT_PORT, () => {
      console.log(`Server running on http://localhost:${ALT_PORT}`);
    });
  } else {
    console.error('Server error:', err);
  }
});
