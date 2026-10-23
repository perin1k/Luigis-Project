import lighthouse from 'lighthouse';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('../node_modules/.cache/ms-playwright', import.meta.url));
const { chromium } = await import('@playwright/test');
const objBrowser = await chromium.launch({ headless: true, args: ['--remote-debugging-port=9223'] });
try {
  const objCheck = await fetch('http://127.0.0.1:3004/__test/reset');
  if (!objCheck.ok || await objCheck.text() !== 'reset') throw new Error('Disposable pricing fixture required.');
  const objResult = await lighthouse('http://127.0.0.1:3004/order', { port: 9223, logLevel: 'error', output: 'json' });
  const objReport = { strUrl: objResult.lhr.finalDisplayedUrl, strVersion: objResult.lhr.lighthouseVersion,
    strPlatform: process.platform, strArchitecture: process.arch, strNodeVersion: process.version,
    strProfile: 'Default mobile simulated throttling; production NODE_ENV; isolated database; native execution OS',
    objConfiguration: { strFormFactor: objResult.lhr.configSettings.formFactor, strThrottlingMethod: objResult.lhr.configSettings.throttlingMethod,
      objScreenEmulation: objResult.lhr.configSettings.screenEmulation, objThrottling: objResult.lhr.configSettings.throttling },
    objScores: Object.fromEntries(Object.entries(objResult.lhr.categories).map(([strId, objCategory]) => [strId, objCategory.score * 100])),
    arrAdvisories: Object.values(objResult.lhr.audits).filter((objAudit) => objAudit.score !== null && objAudit.score < 1)
      .map((objAudit) => ({ strId: objAudit.id, strTitle: objAudit.title, numScore: objAudit.score, strDisplayValue: objAudit.displayValue })),
  };
  mkdirSync('reports', { recursive: true }); writeFileSync('reports/be-01-lighthouse.json', JSON.stringify(objReport, null, 2));
  console.log(JSON.stringify(objReport));
} finally { await objBrowser.close(); }
