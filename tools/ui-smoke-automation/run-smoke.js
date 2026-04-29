const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = __dirname;
const CASE_FILE = path.join(ROOT, 'cases', 'smoke-lobby-room.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseJsonData(jsondata) {
  if (!jsondata) return {};
  if (typeof jsondata === 'object') return jsondata;
  try {
    return JSON.parse(jsondata);
  } catch (_) {
    return {};
  }
}

function pickLogFields(log) {
  if (!log || !log.data) return {};
  return {
    event_name: log.data.event_name,
    function_name: log.data.function_name,
    page_name: log.data.page_name,
    prev_page: log.data.prev_page,
    game_id: log.data.game_id,
    seq_index: log.data.seq_index,
    status: log.status
  };
}

function validateObject(actual, expected) {
  const mismatches = [];
  Object.entries(expected || {}).forEach(([k, v]) => {
    if (actual?.[k] !== v) {
      mismatches.push(`${k}: expected=${v}, actual=${actual?.[k]}`);
    }
  });
  return mismatches;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function writeMarkdown(file, report) {
  const lines = [];
  lines.push(`# UI Smoke Report (${report.run_id})`);
  lines.push('');
  lines.push(`- Suite: ${report.suite_id}`);
  lines.push(`- URL: ${report.base_url || '(empty)'}`);
  lines.push(`- Started At: ${report.started_at}`);
  lines.push(`- Ended At: ${report.ended_at}`);
  lines.push('');
  lines.push('| Case ID | Title | Result | Reason Code | Summary |');
  lines.push('|---|---|---|---|---|');
  report.results.forEach((r) => {
    lines.push(
      `| ${r.case_id} | ${r.title} | ${r.result} | ${r.reason_code || '-'} | ${r.summary || '-'} |`
    );
  });
  lines.push('');
  lines.push('## Artifacts');
  lines.push('');
  report.results.forEach((r) => {
    lines.push(`- ${r.case_id}`);
    lines.push(`  - before: ${r.artifacts.before}`);
    lines.push(`  - after: ${r.artifacts.after || '-'}`);
    lines.push(`  - fail: ${r.artifacts.fail || '-'}`);
  });
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

async function capture(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: false });
}

function parseCaseFile() {
  if (!fs.existsSync(CASE_FILE)) {
    throw new Error(`Case file not found: ${CASE_FILE}`);
  }
  return JSON.parse(fs.readFileSync(CASE_FILE, 'utf8'));
}

async function waitForExpectedLog(logBuffer, startIndex, expected, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const slice = logBuffer.slice(startIndex);
    const hit = slice.find((item) => {
      const data = item?.data || {};
      return Object.entries(expected || {}).every(([key, val]) => data[key] === val);
    });
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function waitForGlobalReady(logs, spec) {
  const expected = spec?.env?.ready_log?.expect || {
    event_name: 'LoadingPage',
    function_name: 'LoadingComplete',
    page_name: 'LoadingPage'
  };
  const timeoutMs = spec?.env?.ready_log?.timeout_ms || 20000;
  const settleMs = spec?.env?.ready_log?.settle_ms || 1500;

  const hit = await waitForExpectedLog(logs, 0, expected, timeoutMs);
  if (!hit) {
    throw new Error('BOOTSTRAP_TIMEOUT: LoadingComplete not received');
  }
  await new Promise((r) => setTimeout(r, settleMs));
  return hit;
}

async function clickByPoints(page, points, viewport, coordinateSpace = 'container', useTouch = false) {
  const interactionRect = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 80 &&
        rect.height > 80 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0'
      );
    };

    const candidates = Array.from(document.querySelectorAll('canvas, video, iframe, #game, #GameCanvas, .game, .game-container'))
      .filter(isVisible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height, area: r.width * r.height };
      })
      .sort((a, b) => b.area - a.area);

    if (candidates.length > 0) return candidates[0];
    return null;
  });

  const viewportRect = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  const baseRect =
    coordinateSpace === 'viewport'
      ? viewportRect
      : interactionRect || viewportRect;

  for (const p of points || []) {
    const x = Math.round(baseRect.x + (p.x || 0) * baseRect.width);
    const y = Math.round(baseRect.y + (p.y || 0) * baseRect.height);
    if (useTouch) {
      await page.touchscreen.tap(x, y);
    } else {
      await page.mouse.click(x, y);
    }
    await page.waitForTimeout(600);
  }
}

function buildGridPoints(scanGrid) {
  const {
    x_min = 0.55,
    x_max = 0.7,
    y_min = 0.01,
    y_max = 0.08,
    x_steps = 4,
    y_steps = 3
  } = scanGrid || {};
  const points = [];
  for (let yi = 0; yi < y_steps; yi += 1) {
    const y = y_min + ((y_max - y_min) * yi) / Math.max(y_steps - 1, 1);
    for (let xi = 0; xi < x_steps; xi += 1) {
      const x = x_min + ((x_max - x_min) * xi) / Math.max(x_steps - 1, 1);
      points.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
    }
  }
  return points;
}

async function clickSinglePoint(page, point, viewport, coordinateSpace = 'container', useTouch = false) {
  await clickByPoints(page, [point], viewport, coordinateSpace, useTouch);
}

function componentToPoints(component, spec) {
  const design = spec?.env?.cocos_design_resolution || { width: 864, height: 1536 };
  const cx = component?.world_position?.x;
  const cy = component?.world_position?.y;
  if (typeof cx !== 'number' || typeof cy !== 'number') return [];

  const offsets = Array.isArray(component?.point_offsets_px) && component.point_offsets_px.length
    ? component.point_offsets_px
    : [
        { dx: 0, dy: 0 },
        { dx: -8, dy: 0 },
        { dx: 8, dy: 0 },
        { dx: 0, dy: -8 },
        { dx: 0, dy: 8 }
      ];

  return offsets.map(({ dx = 0, dy = 0 }) => ({
    x: Number(((cx + dx) / design.width).toFixed(4)),
    y: Number((1 - ((cy + dy) / design.height)).toFixed(4))
  }));
}

function normalizeAction(action, spec) {
  if (!action) return {};
  if (!action.component) return action;
  const points = componentToPoints(action.component, spec);
  return {
    ...action,
    type: action.type || 'click_ratio',
    coordinate_space: action.coordinate_space || 'viewport',
    points
  };
}

async function runActionAndWaitLog(page, logs, spec, action, fallbackTimeoutMs) {
  const normalizedAction = normalizeAction(action, spec);
  const expectedLog = normalizedAction?.expect_log || null;
  const startIndex = logs.length;

  if (normalizedAction?.scan_grid?.enabled) {
    const scanPoints = buildGridPoints(normalizedAction.scan_grid);
    const perPointTimeout = normalizedAction.scan_grid.per_point_timeout_ms || 1200;
    for (const p of scanPoints) {
      await clickSinglePoint(
        page,
        p,
        spec.env.viewport,
        normalizedAction?.coordinate_space || 'container',
        normalizedAction?.use_touch ?? (spec.env.use_touch ?? true)
      );
      if (!expectedLog) return { hit: null, selectedPoint: p };
      const hit = await waitForExpectedLog(logs, startIndex, expectedLog, perPointTimeout);
      if (hit) return { hit, selectedPoint: p };
    }
    return { hit: null, selectedPoint: null };
  }

  await clickByPoints(
    page,
    normalizedAction?.points,
    spec.env.viewport,
    normalizedAction?.coordinate_space || 'container',
    normalizedAction?.use_touch ?? (spec.env.use_touch ?? true)
  );

  if (!expectedLog) return { hit: null, selectedPoint: null };
  const hit = await waitForExpectedLog(
    logs,
    startIndex,
    expectedLog,
    normalizedAction?.log_timeout_ms || fallbackTimeoutMs
  );
  return { hit, selectedPoint: null };
}

async function run() {
  ensureDir(REPORT_DIR);
  ensureDir(SCREENSHOT_DIR);

  const runId = safeNow();
  const spec = parseCaseFile();
  const runBaseUrl = process.env.TARGET_URL || spec.env.base_url;

  if (!runBaseUrl) {
    throw new Error('Missing target URL. Set TARGET_URL env or env.base_url in case file.');
  }

  const browser = await chromium.launch({ headless: !!spec.env.headless });
  const context = await browser.newContext({
    viewport: spec.env.viewport || { width: 1080, height: 1920 },
    ignoreHTTPSErrors: true,
    isMobile: spec.env.is_mobile ?? false,
    hasTouch: spec.env.use_touch ?? true
  });
  const page = await context.newPage();

  const logs = [];
  const logHits = [];
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const keyword = spec.env.log_url_keyword || '/api/log';
      if (!url.includes(keyword)) return;
      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {
        const text = await response.text();
        try {
          payload = JSON.parse(text);
        } catch (_e) {
          payload = null;
        }
      }
      if (payload) logs.push(payload);
      logHits.push({ url, status: response.status(), at: new Date().toISOString() });
    } catch (_) {
      // skip non-json log payloads
    }
  });

  const report = {
    run_id: runId,
    suite_id: spec.suite_id,
    base_url: runBaseUrl.replace(/accessToken=[^&]+/i, 'accessToken=***'),
    started_at: new Date().toISOString(),
    ended_at: '',
    results: []
  };

  try {
    await page.goto(runBaseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    await waitForGlobalReady(logs, spec);

    const selectedCaseIds = (process.env.CASE_ID || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const runCases = selectedCaseIds.length
      ? spec.cases.filter((c) => selectedCaseIds.includes(c.case_id))
      : spec.cases;

    for (let i = 0; i < runCases.length; i += 1) {
      const tc = runCases[i];
      const caseResult = {
        case_id: tc.case_id,
        title: tc.title,
        result: 'PASS',
        reason_code: '',
        summary: '',
        log: {},
        artifacts: {
          before: path.join('screenshots', `${runId}_${tc.case_id}_before.png`),
          after: path.join('screenshots', `${runId}_${tc.case_id}_after.png`),
          fail: path.join('screenshots', `${runId}_${tc.case_id}_fail.png`)
        }
      };

      try {
        if (i > 0 && (spec?.env?.reload_each_case ?? true)) {
          await page.goto(runBaseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForTimeout(1000);
          await waitForGlobalReady(logs, spec);
        }

        const beforePath = path.join(ROOT, caseResult.artifacts.before);
        await capture(page, beforePath);

        for (const pre of tc.preconditions || []) {
          if (pre.type === 'log') {
            const ok = logs.some((item) =>
              Object.entries(pre.expect || {}).every(([k, v]) => item?.data?.[k] === v)
            );
            if (!ok) {
              throw new Error('PRECONDITION_NOT_MET: expected precondition log not found');
            }
          }
        }

        const expectedLog = tc.assertions?.log?.expect || {};
        let hit = null;
        let selectedPoint = null;

        if (Array.isArray(tc.actions) && tc.actions.length > 0) {
          for (const action of tc.actions) {
            const step = await runActionAndWaitLog(page, logs, spec, action, spec.env.log_timeout_ms || 10000);
            if (action?.expect_log && !step.hit) {
              throw new Error(`LOG_TIMEOUT: action ${action.target || 'unknown'} expected log not found`);
            }
          }
          hit = logs.slice().reverse().find((item) =>
            Object.entries(expectedLog || {}).every(([key, val]) => item?.data?.[key] === val)
          );
        } else {
          const step = await runActionAndWaitLog(page, logs, spec, tc.action || {}, spec.env.log_timeout_ms || 10000);
          hit = step.hit;
          selectedPoint = step.selectedPoint;
        }

        if (!hit) {
          throw new Error('LOG_TIMEOUT: expected log not found in timeout');
        }

        const rootMismatches = validateObject(hit, { status: 200 });
        if (rootMismatches.length) {
          throw new Error(`LOG_FIELD_MISMATCH: ${rootMismatches.join('; ')}`);
        }

        const logMismatches = validateObject(hit.data || {}, expectedLog);
        if (logMismatches.length) {
          throw new Error(`LOG_FIELD_MISMATCH: ${logMismatches.join('; ')}`);
        }

        const parsedJson = parseJsonData(hit?.data?.jsondata);
        const requiredKeys = tc.assertions?.log?.jsondata_required_keys || [];
        const missingKeys = requiredKeys.filter((k) => parsedJson?.[k] === undefined);
        if (missingKeys.length) {
          throw new Error(`JSONDATA_MISSING_KEY: ${missingKeys.join(', ')}`);
        }

        const expectedJson = tc.assertions?.log?.jsondata_expect || {};
        const jsonMismatches = validateObject(parsedJson, expectedJson);
        if (jsonMismatches.length) {
          throw new Error(`JSONDATA_VALUE_MISMATCH: ${jsonMismatches.join('; ')}`);
        }

        await page.waitForTimeout(700);
        const afterPath = path.join(ROOT, caseResult.artifacts.after);
        await capture(page, afterPath);

        caseResult.log = pickLogFields(hit);
        caseResult.summary = `Matched ${hit?.data?.function_name || '-'} with seq ${hit?.data?.seq_index || '-'}${selectedPoint ? ` @ point(${selectedPoint.x},${selectedPoint.y})` : ''}`;
      } catch (err) {
        caseResult.result = 'FAIL';
        const errMsg = String(err?.message || err || 'Unknown error');
        caseResult.reason_code = (errMsg.split(':')[0] || 'CASE_FAILED').trim();
        const recentLogs = logs.slice(-3).map((l) => pickLogFields(l));
        caseResult.summary = `${errMsg}; log_hits=${logHits.length}; recent_logs=${JSON.stringify(recentLogs)}`;
        const failPath = path.join(ROOT, caseResult.artifacts.fail);
        await capture(page, failPath);
      }

      report.results.push(caseResult);
      await page.waitForTimeout(spec?.env?.case_settle_ms ?? 2300);
    }
  } finally {
    report.ended_at = new Date().toISOString();
    await context.close();
    await browser.close();
  }

  const jsonPath = path.join(REPORT_DIR, `report-${runId}.json`);
  const mdPath = path.join(REPORT_DIR, `report-${runId}.md`);
  writeJson(jsonPath, report);
  writeMarkdown(mdPath, report);

  const passCount = report.results.filter((r) => r.result === 'PASS').length;
  const failCount = report.results.length - passCount;
  console.log(`Done. PASS=${passCount}, FAIL=${failCount}`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`MD report: ${mdPath}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
