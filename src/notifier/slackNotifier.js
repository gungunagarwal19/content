const axios = require('axios');
const store = require('../db/store');

function buildSlackBlocks(domain, newPosts = [], pricingDiff = null) {
  const competitorName = domain.toUpperCase();
  const postCount = newPosts.length;

  let summaryText = '';
  if (postCount > 0 && pricingDiff && pricingDiff.hasChanged) {
    summaryText = `*${competitorName}* published *${postCount} new post${postCount === 1 ? '' : 's'}* and updated their *pricing*!`;
  } else if (postCount > 0) {
    summaryText = `*${competitorName}* published *${postCount} new post${postCount === 1 ? '' : 's'}*!`;
  } else if (pricingDiff && pricingDiff.hasChanged) {
    summaryText = `*${competitorName}* made changes to their *pricing structure*!`;
  } else {
    summaryText = `*${competitorName}* scan complete — no new changes detected.`;
  }

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🎯 Competitor Alert: ${domain}`,
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summaryText
      }
    },
    {
      type: 'divider'
    }
  ];

  if (postCount > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📰 Newly Published Articles (${postCount})*`
      }
    });

    newPosts.slice(0, 10).forEach((post, i) => {
      const dateFormatted = post.publishDate ? new Date(post.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';
      const volFormatted = post.searchVolume ? Number(post.searchVolume).toLocaleString() : 'N/A';
      const cpcFormatted = post.cpc ? `$${post.cpc}` : '$0.00';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${i + 1}. <${post.url}|${post.title}>*\n📅 Published: _${dateFormatted}_\n🎯 Keyword: \`${post.targetKeyword || post.keyword}\` | 📈 Est. Vol: *${volFormatted}/mo* (CPC ${cpcFormatted})\n📝 _${post.metaDescription || 'No description'}_`
        }
      });
    });

    if (postCount > 10) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_+ ${postCount - 10} more posts found._`
          }
        ]
      });
    }
  }

  if (pricingDiff && pricingDiff.hasChanged) {
    blocks.push({
      type: 'divider'
    });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💳 Pricing Changes Detected:*\n${pricingDiff.changes.map(c => `• *${c.type}*: ${c.details}`).join('\n')}`
      }
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Automated by Competitor Monitor • ${new Date().toUTCString()}`
      }
    ]
  });

  return {
    text: summaryText.replace(/\*/g, ''),
    blocks
  };
}

async function sendSlackAlert(domain, newPosts = [], pricingDiff = null, customWebhook = null) {
  const settings = store.getSettings();
  const webhookUrl = customWebhook || settings.slackWebhookUrl;

  const payload = buildSlackBlocks(domain, newPosts, pricingDiff);

  if (!webhookUrl) {
    const alertEntry = store.addAlert({
      type: 'SLACK',
      competitorDomain: domain,
      message: payload.text,
      payload,
      status: 'LOGGED_ONLY',
      note: 'Slack webhook URL not configured in Settings. Alert preview stored.'
    });
    return {
      success: false,
      reason: 'WEBHOOK_NOT_CONFIGURED',
      message: 'Slack webhook URL not set in Settings. Alert logged to dashboard.',
      alertId: alertEntry.id,
      preview: payload
    };
  }

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000
    });

    const alertEntry = store.addAlert({
      type: 'SLACK',
      competitorDomain: domain,
      message: payload.text,
      payload,
      status: 'SENT',
      note: 'Successfully delivered to Slack.'
    });

    return {
      success: true,
      status: response.status,
      alertId: alertEntry.id
    };
  } catch (err) {
    const errorMsg = err.response?.data || err.message;
    store.addAlert({
      type: 'SLACK',
      competitorDomain: domain,
      message: payload.text,
      payload,
      status: 'FAILED',
      error: errorMsg
    });

    return {
      success: false,
      reason: 'DELIVERY_ERROR',
      error: errorMsg
    };
  }
}

module.exports = {
  buildSlackBlocks,
  sendSlackAlert
};
