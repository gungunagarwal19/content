document.addEventListener('DOMContentLoaded', () => {
  const scanForm = document.getElementById('scanForm');
  const domainInput = document.getElementById('domainInput');
  const sendBaselineAlertCheck = document.getElementById('sendBaselineAlertCheck');
  const btnRunScan = document.getElementById('btnRunScan');
  const scanStatusBar = document.getElementById('scanStatusBar');
  const scanStatusText = document.getElementById('scanStatusText');

  const statCompetitorsCount = document.getElementById('statCompetitorsCount');
  const statPostsCount = document.getElementById('statPostsCount');
  const statAlertsCount = document.getElementById('statAlertsCount');
  const statPricingChecks = document.getElementById('statPricingChecks');

  const badgeCompetitors = document.getElementById('badgeCompetitors');
  const badgeArticles = document.getElementById('badgeArticles');
  const badgeAlerts = document.getElementById('badgeAlerts');

  const articlesList = document.getElementById('articlesList');
  const filterDomainSelect = document.getElementById('filterDomainSelect');
  const filterKeywordInput = document.getElementById('filterKeywordInput');
  const competitorsGrid = document.getElementById('competitorsGrid');
  const pricingDomainSelect = document.getElementById('pricingDomainSelect');
  const pricingDetailsView = document.getElementById('pricingDetailsView');
  const alertsList = document.getElementById('alertsList');
  const runsHistoryList = document.getElementById('runsHistoryList');

  const settingsModal = document.getElementById('settingsModal');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const settingsForm = document.getElementById('settingsForm');
  const keywordProviderSelect = document.getElementById('keywordProviderSelect');
  const dataForSeoFields = document.getElementById('dataForSeoFields');
  const keywordsEverywhereFields = document.getElementById('keywordsEverywhereFields');

  const alertPreviewModal = document.getElementById('alertPreviewModal');
  const btnCloseAlertPreview = document.getElementById('btnCloseAlertPreview');
  const alertPreviewTitle = document.getElementById('alertPreviewTitle');
  const alertPreviewBody = document.getElementById('alertPreviewBody');

  let allCompetitors = [];
  let allPosts = [];
  let allAlerts = [];
  let allRuns = [];

  refreshAllData();

  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  document.querySelectorAll('.preset-link').forEach(link => {
    link.addEventListener('click', () => {
      domainInput.value = link.getAttribute('data-domain');
      domainInput.focus();
    });
  });

  function setStatus(text) {
    if (!text) {
      scanStatusBar.style.display = 'none';
      return;
    }
    scanStatusBar.style.display = 'flex';
    scanStatusText.textContent = text;
  }

  scanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = domainInput.value.trim();
    if (!domain) return;
    await executeScan(domain, sendBaselineAlertCheck.checked);
  });

  async function executeScan(domain, sendAlertOnBaseline = false) {
    setLoadingState(true);
    setStatus(`Scanning ${domain}...`);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, sendAlertOnBaseline })
      });
      const data = await res.json();

      if (!data.success) {
        setStatus(`Scan error: ${data.error || 'Failed to reach domain.'}`);
      } else {
        const scan = data.data;
        if (!scan.hasBlog) {
          setStatus(`${domain}: No active blog found.`);
        } else if (scan.isFirstRun) {
          setStatus(`Complete: Baseline established for ${domain} (${scan.totalScraped} articles tracked).`);
        } else {
          setStatus(`Complete: Found ${scan.newPostsCount} new article(s).`);
        }
      }

      await refreshAllData();

    } catch (err) {
      setStatus(`Network error: ${err.message}`);
    } finally {
      setLoadingState(false);
    }
  }

  function setLoadingState(loading) {
    const btnText = btnRunScan.querySelector('.btn-text');
    const spinner = btnRunScan.querySelector('.btn-spinner');
    if (loading) {
      btnRunScan.disabled = true;
      btnText.textContent = 'Scanning...';
      spinner.style.display = 'inline-block';
    } else {
      btnRunScan.disabled = false;
      btnText.textContent = 'Scan Domain';
      spinner.style.display = 'none';
    }
  }

  async function refreshAllData() {
    try {
      const [compRes, postsRes, alertsRes, runsRes] = await Promise.all([
        fetch('/api/competitors').then(r => r.json()),
        fetch('/api/posts').then(r => r.json()),
        fetch('/api/alerts').then(r => r.json()),
        fetch('/api/scan/history').then(r => r.json())
      ]);

      if (compRes.success) allCompetitors = compRes.data;
      if (postsRes.success) allPosts = postsRes.data;
      if (alertsRes.success) allAlerts = alertsRes.data;
      if (runsRes.success) allRuns = runsRes.data;

      updateMetricCounters();
      renderArticles();
      renderCompetitors();
      renderAlerts();
      renderRunsHistory();
      populateDropdowns();

    } catch (e) {
      console.error(e);
    }
  }

  function updateMetricCounters() {
    statCompetitorsCount.textContent = allCompetitors.length;
    statPostsCount.textContent = allPosts.length;
    statAlertsCount.textContent = allAlerts.length;
    statPricingChecks.textContent = allRuns.filter(r => r.pricingChanged !== undefined).length || allCompetitors.length;

    badgeCompetitors.textContent = allCompetitors.length;
    badgeArticles.textContent = allPosts.length;
    badgeAlerts.textContent = allAlerts.length;
  }

  function populateDropdowns() {
    const currentFilter = filterDomainSelect.value;
    filterDomainSelect.innerHTML = '<option value="">All Competitor Domains</option>';
    allCompetitors.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.domain;
      opt.textContent = c.domain;
      if (c.domain === currentFilter) opt.selected = true;
      filterDomainSelect.appendChild(opt);
    });

    const currentPricing = pricingDomainSelect.value;
    pricingDomainSelect.innerHTML = '<option value="">Select a Competitor</option>';
    allCompetitors.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.domain;
      opt.textContent = c.domain;
      if (c.domain === currentPricing) opt.selected = true;
      pricingDomainSelect.appendChild(opt);
    });

    if (!pricingDomainSelect.value && allCompetitors.length > 0) {
      pricingDomainSelect.value = allCompetitors[0].domain;
      loadPricingForDomain(allCompetitors[0].domain);
    }
  }

  function renderArticles() {
    const filterDomain = filterDomainSelect.value.toLowerCase();
    const filterKeyword = filterKeywordInput.value.toLowerCase().trim();

    let filtered = allPosts;
    if (filterDomain) {
      filtered = filtered.filter(p => p.domain.toLowerCase() === filterDomain);
    }
    if (filterKeyword) {
      filtered = filtered.filter(p =>
        (p.title && p.title.toLowerCase().includes(filterKeyword)) ||
        (p.targetKeyword && p.targetKeyword.toLowerCase().includes(filterKeyword)) ||
        (p.metaDescription && p.metaDescription.toLowerCase().includes(filterKeyword))
      );
    }

    if (filtered.length === 0) {
      articlesList.innerHTML = `
        <div class="empty-state">
          No articles tracked yet. Enter a competitor domain above to run your first crawl.
        </div>
      `;
      return;
    }

    articlesList.innerHTML = filtered.map(post => {
      const pubDate = post.publishDate ? new Date(post.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
      const volumeFormatted = post.searchVolume ? Number(post.searchVolume).toLocaleString() : 'N/A';
      const isNew = post.isBaseline === false;

      return `
        <article class="article-item">
          <div class="article-top">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="domain-pill">${post.domain}</span>
              ${isNew ? '<span class="new-badge">New Post</span>' : ''}
            </div>
            <span class="article-date">${pubDate}</span>
          </div>

          <h3 class="article-headline">
            <a href="${post.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a>
          </h3>

          <p class="article-snippet">
            ${escapeHtml(post.metaDescription || 'No description available.')}
          </p>

          <div class="article-footer">
            <div class="keyword-stat">
              <span>Keyword:</span>
              <span class="keyword-badge">${escapeHtml(post.targetKeyword || post.keyword || 'General')}</span>
            </div>
            <div class="keyword-stat">
              <span>Est. Volume:</span>
              <span class="volume-value">${volumeFormatted}/mo</span>
            </div>
            ${post.cpc ? `<div class="keyword-stat" style="color: var(--text-muted);">CPC: $${post.cpc}</div>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  filterDomainSelect.addEventListener('change', renderArticles);
  filterKeywordInput.addEventListener('input', renderArticles);

  function renderCompetitors() {
    if (allCompetitors.length === 0) {
      competitorsGrid.innerHTML = `
        <div class="empty-state">No competitors tracked yet.</div>
      `;
      return;
    }

    competitorsGrid.innerHTML = allCompetitors.map(c => {
      const postsCount = allPosts.filter(p => p.domain.toLowerCase() === c.domain.toLowerCase()).length;
      const lastScanned = c.lastScannedAt ? new Date(c.lastScannedAt).toLocaleDateString() : 'Never';

      return `
        <div class="competitor-row">
          <div class="comp-info">
            <span class="comp-domain-name">${c.domain}</span>
            <span class="comp-meta">${postsCount} articles • Last checked: ${lastScanned}</span>
          </div>
          <div class="comp-buttons">
            <button class="btn btn-secondary btn-sm btn-rescan" data-domain="${c.domain}">Scan</button>
            <button class="btn btn-secondary btn-sm btn-pricing" data-domain="${c.domain}">Pricing</button>
            <button class="btn btn-danger btn-sm btn-delete" data-id="${c.id}">Remove</button>
          </div>
        </div>
      `;
    }).join('');

    competitorsGrid.querySelectorAll('.btn-rescan').forEach(btn => {
      btn.addEventListener('click', () => {
        const domain = btn.getAttribute('data-domain');
        domainInput.value = domain;
        executeScan(domain, false);
      });
    });

    competitorsGrid.querySelectorAll('.btn-pricing').forEach(btn => {
      btn.addEventListener('click', () => {
        const domain = btn.getAttribute('data-domain');
        pricingDomainSelect.value = domain;
        loadPricingForDomain(domain);
        document.querySelector('[data-tab="tabPricing"]').click();
      });
    });

    competitorsGrid.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this competitor?')) return;
        const id = btn.getAttribute('data-id');
        await fetch(`/api/competitors/${id}`, { method: 'DELETE' });
        await refreshAllData();
      });
    });
  }

  pricingDomainSelect.addEventListener('change', () => {
    loadPricingForDomain(pricingDomainSelect.value);
  });

  async function loadPricingForDomain(domain) {
    if (!domain) return;
    try {
      const res = await fetch(`/api/pricing/${domain}`);
      const data = await res.json();
      if (!data.success || !data.data.latest) {
        pricingDetailsView.innerHTML = `<div class="empty-state">No pricing data captured for ${domain} yet.</div>`;
        return;
      }

      const latest = data.data.latest;
      let diffHtml = '';
      if (latest.hasChanged && latest.changes && latest.changes.length > 0) {
        diffHtml = `
          <div class="pricing-alert-card">
            <strong>Pricing Modifications Detected:</strong>
            <ul style="margin: 6px 0 0 18px;">
              ${latest.changes.map(c => `<li>${escapeHtml(c.details)}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      const plansHtml = (latest.plans || []).map(p => `
        <div class="plan-box">
          <div class="plan-title">${escapeHtml(p.name)}</div>
          <div class="plan-cost">${escapeHtml(p.price)}</div>
          <ul class="plan-items">
            ${(p.features || []).map(f => `<li>• ${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>
      `).join('');

      pricingDetailsView.innerHTML = `
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
          Pricing for <strong>${domain}</strong> &nbsp;|&nbsp; URL: <a href="${latest.pricingUrl}" target="_blank" style="color: var(--accent-blue);">${latest.pricingUrl}</a>
        </div>
        ${diffHtml}
        <div class="pricing-cards-row">
          ${plansHtml || '<div class="empty-state">No plan cards parsed.</div>'}
        </div>
      `;
    } catch (e) {
      console.error(e);
    }
  }

  function renderAlerts() {
    if (allAlerts.length === 0) {
      alertsList.innerHTML = `<div class="empty-state">No alerts triggered yet.</div>`;
      return;
    }

    alertsList.innerHTML = allAlerts.map(a => {
      const channel = (a.type || 'slack').toLowerCase();
      const time = new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="alert-item">
          <div class="alert-left">
            <span class="badge-channel ${channel}">${a.type}</span>
            <span class="alert-msg">${escapeHtml(a.message)}</span>
          </div>
          <div class="alert-right">
            <span>${time}</span>
            <button class="btn btn-secondary btn-sm btn-inspect" data-id="${a.id}">View Payload</button>
          </div>
        </div>
      `;
    }).join('');

    alertsList.querySelectorAll('.btn-inspect').forEach(btn => {
      btn.addEventListener('click', () => {
        const alert = allAlerts.find(a => a.id === btn.getAttribute('data-id'));
        if (alert) openAlertPreview(alert);
      });
    });
  }

  function openAlertPreview(alert) {
    alertPreviewTitle.textContent = `Slack Alert Payload (${alert.competitorDomain})`;

    alertPreviewBody.innerHTML = `
      <pre style="background: var(--bg-elevated); padding: 12px; border-radius: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); overflow-x: auto; max-height: 380px;">${escapeHtml(JSON.stringify(alert.payload, null, 2))}</pre>
    `;

    alertPreviewModal.style.display = 'flex';
  }

  btnCloseAlertPreview.addEventListener('click', () => {
    alertPreviewModal.style.display = 'none';
  });

  function renderRunsHistory() {
    if (allRuns.length === 0) {
      runsHistoryList.innerHTML = `<div class="empty-state">No scan history recorded.</div>`;
      return;
    }

    const rows = allRuns.map(r => {
      const time = new Date(r.startedAt).toLocaleTimeString();
      const type = r.isFirstRun ? 'Baseline' : 'Differential';
      const statusColor = r.status === 'COMPLETED' ? 'var(--accent-green-text)' : 'var(--accent-amber)';

      return `
        <tr>
          <td><strong>${r.domain}</strong></td>
          <td><span style="color: ${statusColor}; font-weight: 500;">${r.status}</span></td>
          <td>${type}</td>
          <td>${r.postsFound || 0}</td>
          <td><strong style="color: var(--accent-blue);">${r.newPostsCount || 0}</strong></td>
          <td>${r.pricingChanged ? '<span style="color: var(--accent-amber);">Modified</span>' : 'Unchanged'}</td>
          <td>${time}</td>
        </tr>
      `;
    }).join('');

    runsHistoryList.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Domain</th>
            <th>Status</th>
            <th>Type</th>
            <th>Posts Found</th>
            <th>New Posts</th>
            <th>Pricing</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  btnOpenSettings.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        const s = data.data;
        document.getElementById('slackWebhookInput').value = s.slackWebhookUrl || '';
        keywordProviderSelect.value = s.keywordProvider || 'heuristic_fallback';
        document.getElementById('dataForSeoLogin').value = s.dataForSeoLogin || '';
        document.getElementById('dataForSeoPassword').value = s.dataForSeoPassword || '';
        document.getElementById('keywordsEverywhereKey').value = s.keywordsEverywhereApiKey || '';
        updateProviderFields();
      }
      settingsModal.style.display = 'flex';
    } catch (e) {
      alert('Error fetching settings: ' + e.message);
    }
  });

  function updateProviderFields() {
    const val = keywordProviderSelect.value;
    dataForSeoFields.style.display = val === 'dataforseo' ? 'block' : 'none';
    keywordsEverywhereFields.style.display = val === 'keywords_everywhere' ? 'block' : 'none';
  }

  keywordProviderSelect.addEventListener('change', updateProviderFields);

  function closeSettings() {
    settingsModal.style.display = 'none';
  }

  btnCloseSettings.addEventListener('click', closeSettings);
  btnCancelSettings.addEventListener('click', closeSettings);

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      slackWebhookUrl: document.getElementById('slackWebhookInput').value.trim(),
      keywordProvider: keywordProviderSelect.value,
      dataForSeoLogin: document.getElementById('dataForSeoLogin').value.trim(),
      dataForSeoPassword: document.getElementById('dataForSeoPassword').value.trim(),
      keywordsEverywhereApiKey: document.getElementById('keywordsEverywhereKey').value.trim()
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        closeSettings();
        setStatus('Settings updated successfully.');
      }
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    }
  });

  document.getElementById('btnTestSlackSettings').addEventListener('click', async () => {
    const webhookUrl = document.getElementById('slackWebhookInput').value.trim();
    const res = await fetch('/api/alerts/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl })
    });
    const data = await res.json();
    alert(data.success ? 'Slack alert delivered!' : `Notice: ${data.data?.message || data.error}`);
    await refreshAllData();
  });

  document.getElementById('btnSendTestAlert').addEventListener('click', async () => {
    const res = await fetch('/api/alerts/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    setStatus(data.success ? 'Test Slack alert dispatched.' : 'Sample alert recorded in Alerts tab.');
    await refreshAllData();
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeHtmlAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;');
  }
});
