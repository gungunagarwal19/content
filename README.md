# Competitor Monitor

A lightweight competitor monitoring tool that tracks competitor blogs and pricing pages, enriches discovered articles with search keywords and volume estimates, and sends automated Slack alerts.

## Features

- **Autonomous Scraper**: Crawls homepages, blog listing pages, and RSS/Atom feeds without relying on external scraping APIs.
- **Differential Tracking**: Persists post history to ensure only genuinely new articles trigger notifications on repeat runs.
- **Pricing Change Detection**: Parses pricing tiers and feature lists, computes content hashes, and surfaces plan or price diffs.
- **SEO Keyword Enrichment**: Estimates target keywords and monthly search volume using either built-in intent heuristics or optional live API keys (DataForSEO / Keywords Everywhere).
- **Slack Alerting**: Posts updates formatted with Slack Block Kit directly via an Incoming Webhook configured in the dashboard.

## Setup & Running

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the application:
   ```bash
   npm start
   ```

3. Open your browser:
   ```
   http://localhost:3000
   ```

## Configuration

- Click **Settings & Webhooks** in the top navigation to add your Slack Incoming Webhook URL.
- Optional API keys for SEO providers can be configured in the same settings dialog. If omitted or expired, the app automatically falls back to built-in search volume estimation.
