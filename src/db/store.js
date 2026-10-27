const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/db.json');

const DEFAULT_DATA = {
  competitors: [],
  posts: [],
  pricingSnapshots: [],
  scanRuns: [],
  alerts: [],
  settings: {
    slackWebhookUrl: '',
    keywordProvider: 'heuristic_fallback',
    dataForSeoLogin: '',
    dataForSeoPassword: '',
    keywordsEverywhereApiKey: '',
    autoAlertOnNewPosts: true,
    autoAlertOnPricingChange: true
  }
};

class Store {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(DB_PATH)) {
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
        return JSON.parse(JSON.stringify(DEFAULT_DATA));
      }
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_DATA,
        ...parsed,
        settings: { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) }
      };
    } catch (err) {
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      const tempPath = DB_PATH + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tempPath, DB_PATH);
    } catch (err) {
      console.error('Failed to save store:', err.message);
    }
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }

  getCompetitors() {
    return this.data.competitors;
  }

  getCompetitor(idOrDomain) {
    return this.data.competitors.find(
      c => c.id === idOrDomain || c.domain.toLowerCase() === idOrDomain.toLowerCase()
    );
  }

  saveCompetitor(competitorData) {
    const existingIndex = this.data.competitors.findIndex(
      c => c.domain.toLowerCase() === competitorData.domain.toLowerCase()
    );
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      this.data.competitors[existingIndex] = {
        ...this.data.competitors[existingIndex],
        ...competitorData,
        updatedAt: now
      };
      this.save();
      return this.data.competitors[existingIndex];
    } else {
      const newCompetitor = {
        id: 'comp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        domain: competitorData.domain.toLowerCase(),
        name: competitorData.name || competitorData.domain,
        createdAt: now,
        lastScannedAt: null,
        scanCount: 0,
        totalPosts: 0,
        ...competitorData
      };
      this.data.competitors.push(newCompetitor);
      this.save();
      return newCompetitor;
    }
  }

  deleteCompetitor(id) {
    this.data.competitors = this.data.competitors.filter(c => c.id !== id);
    this.data.posts = this.data.posts.filter(p => p.competitorId !== id);
    this.data.pricingSnapshots = this.data.pricingSnapshots.filter(p => p.competitorId !== id);
    this.data.scanRuns = this.data.scanRuns.filter(r => r.competitorId !== id);
    this.save();
  }

  getPostsByDomain(domain) {
    return this.data.posts.filter(p => p.domain.toLowerCase() === domain.toLowerCase());
  }

  getPostByUrl(url) {
    return this.data.posts.find(p => p.url === url);
  }

  savePost(post) {
    const existingIndex = this.data.posts.findIndex(p => p.url === post.url);
    if (existingIndex >= 0) {
      this.data.posts[existingIndex] = {
        ...this.data.posts[existingIndex],
        ...post
      };
      this.save();
      return { post: this.data.posts[existingIndex], isNew: false };
    } else {
      const newPost = {
        id: 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        firstSeenAt: new Date().toISOString(),
        ...post
      };
      this.data.posts.push(newPost);
      this.save();
      return { post: newPost, isNew: true };
    }
  }

  getLatestPricing(domain) {
    const snapshots = this.data.pricingSnapshots
      .filter(p => p.domain.toLowerCase() === domain.toLowerCase())
      .sort((a, b) => new Date(b.snapshotTime) - new Date(a.snapshotTime));
    return snapshots[0] || null;
  }

  savePricingSnapshot(snapshot) {
    const entry = {
      id: 'price_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      snapshotTime: new Date().toISOString(),
      ...snapshot
    };
    this.data.pricingSnapshots.push(entry);
    this.save();
    return entry;
  }

  addScanRun(run) {
    const entry = {
      id: 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      startedAt: new Date().toISOString(),
      logs: [],
      ...run
    };
    this.data.scanRuns.unshift(entry);
    if (this.data.scanRuns.length > 100) {
      this.data.scanRuns = this.data.scanRuns.slice(0, 100);
    }
    this.save();
    return entry;
  }

  updateScanRun(id, updates) {
    const run = this.data.scanRuns.find(r => r.id === id);
    if (run) {
      Object.assign(run, updates);
      this.save();
      return run;
    }
    return null;
  }

  getScanRuns(domain = null) {
    if (domain) {
      return this.data.scanRuns.filter(r => r.domain.toLowerCase() === domain.toLowerCase());
    }
    return this.data.scanRuns;
  }

  addAlert(alert) {
    const entry = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      ...alert
    };
    this.data.alerts.unshift(entry);
    if (this.data.alerts.length > 100) {
      this.data.alerts = this.data.alerts.slice(0, 100);
    }
    this.save();
    return entry;
  }

  getAlerts() {
    return this.data.alerts;
  }
}

module.exports = new Store();
