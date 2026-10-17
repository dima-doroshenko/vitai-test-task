import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const url = 'https://kvarta-minsk.pages.dev/';
const [pagesDeployment = null, workerVersion = null] = process.argv.slice(2);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const runs = [];
mkdirSync('output/lighthouse', { recursive: true });
for (const name of ['mobile-1', 'mobile-2', 'mobile-3', 'desktop']) {
  const path = `output/lighthouse/${name}`;
  const args = ['node_modules/lighthouse/cli/index.js', url, '--output', 'html', '--output', 'json',
    '--output-path', path, '--chrome-flags=--headless',
    '--only-categories=performance,accessibility,best-practices,seo', '--quiet'];
  if (name === 'desktop') args.push('--preset=desktop');
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
  const report = JSON.parse(readFileSync(`${path}.report.json`, 'utf8'));
  const scores = Object.fromEntries(Object.entries(report.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  runs.push({ name, scores, fetchTime: report.fetchTime, lighthouseVersion: report.lighthouseVersion,
    requestedUrl: report.requestedUrl, finalDisplayedUrl: report.finalDisplayedUrl,
    userAgent: report.userAgent, environment: report.environment, configSettings: report.configSettings,
    metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].map(k => [k, report.audits[k].numericValue])),
    reports: [`${name}.report.html`, `${name}.report.json`] });
  console.log(name, JSON.stringify(scores));
}
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const mobileMedian = Object.fromEntries(Object.keys(runs[0].scores).map(k => [k, median(runs.slice(0, 3).map(r => r.scores[k]))]));
const files = ['public/index.html', 'public/style.css', 'public/app.js', 'public/phone.js', 'functions/api/lead.js', 'backend/src/worker.js'];
const summary = { url, clientDate: '2026-10-17', timezone: 'Europe/Minsk', sourceCommit: commit,
  pagesDeployment, workerVersion,
  protocol: 'Sequential CLI runs on the same host. Each run launches a fresh headless Chrome profile. Three identical default mobile/simulate runs; separate desktop preset. No local scores.',
  hashes: Object.fromEntries(files.map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')])),
  mobileMedian, runs };
writeFileSync('output/lighthouse/summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log('Mobile median:', JSON.stringify(mobileMedian));
