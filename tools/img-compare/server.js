/**
 * 圖片比對工具 — Node.js Server
 * Playwright 訪問目標頁面，攔截所有 image 類型請求
 * 成功（200–299 且 image/*、或 304 快取命中）→ 比對用
 * 失敗（4xx/5xx、或非 image Content-Type）→ 單獨列表給 QA
 */

const express = require('express');
const { chromium } = require('playwright');
const crypto  = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// sessions: Map<sessionId, { A: SideData, B: SideData, createdAt }>
// SideData = { ok: ImageEntry[], failed: FailedEntry[] }
const sessions = new Map();

setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [id, s] of sessions.entries()) {
    if (s.createdAt < cutoff) sessions.delete(id);
  }
}, 600_000);

function emptySide() {
  return { ok: [], failed: [] };
}

/** 擷取模式：不暴露秒數給使用者，由前端傳 captureMode */
const CAPTURE_PRESETS = {
  standard: {
    label:          '標準',
    QUIET_MS:       3000,
    MAX_WAIT_MS:    30000,
    MIN_PHASE_MS:   0,
    DUP_EARLY_EXIT: true,
    DUP_HIT_END:    12,
    SCROLL_MAX_MS:  8000
  },
  polling: {
    label:          '含列表輪詢',
    QUIET_MS:       10000,
    MAX_WAIT_MS:    90000,
    MIN_PHASE_MS:   22000,
    DUP_EARLY_EXIT: false,
    DUP_HIT_END:    12,
    SCROLL_MAX_MS:  12000
  }
};

function resolveCapturePreset(mode) {
  const key = mode === 'polling' ? 'polling' : 'standard';
  return { key, ...CAPTURE_PRESETS[key] };
}

app.get('/api/session', (_req, res) => {
  const id = crypto.randomBytes(8).toString('hex');
  sessions.set(id, { A: emptySide(), B: emptySide(), createdAt: Date.now() });
  res.json({ sessionId: id });
});

/** HTTP 成功：可取得圖片本體或 304 快取命中（視為有載到） */
function isHttpImageSuccess(status) {
  return (status >= 200 && status < 300) || status === 304;
}

function previewText(buffer, maxLen = 200) {
  if (!buffer || buffer.length === 0) return '';
  try {
    const s = buffer.toString('utf8', 0, Math.min(buffer.length, 800));
    return s.replace(/\s+/g, ' ').slice(0, maxLen);
  } catch {
    return '';
  }
}

app.post('/api/capture', async (req, res) => {
  const { url, side, sessionId, captureMode } = req.body;

  if (!url || !['A', 'B'].includes(side) || !sessionId) {
    return res.status(400).json({ error: '參數錯誤：需要 url / side / sessionId' });
  }

  const preset = resolveCapturePreset(captureMode);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let browser;
  try {
    send({
      type: 'status',
      message: `啟動瀏覽器…（擷取模式：${preset.label}）`
    });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    const okList     = [];
    const failedList = [];
    const MAX_OK     = 300;
    const MAX_FAIL   = 200;
    const MAX_BYTE   = 8 * 1024 * 1024;
    const seenOkKeys = new Set();
    let duplicateHits = 0;
    let lastNewImageAt = Date.now();

    page.on('response', async (response) => {
      const type = response.request().resourceType();
      if (type !== 'image') return;

      const status      = response.status();
      const imgUrl      = response.url();
      let headers;
      try {
        headers = response.headers();
      } catch {
        return;
      }
      const rawCT       = headers['content-type'] || '';
      const contentType = rawCT.split(';')[0].trim().toLowerCase();
      const isImageCT   = contentType.startsWith('image/');

      const rawName  = imgUrl.split('/').pop().split('?')[0];
      const filename = decodeURIComponent(rawName) || 'unknown';

      lastNewImageAt = Date.now();

      let buffer;
      try {
        buffer = await response.body();
      } catch {
        buffer = null;
      }

      const httpOk = isHttpImageSuccess(status);

      // ── 失敗：4xx/5xx，或 HTTP 成功但回傳不是圖（例如 404 + application/xml）
      if (!httpOk || !isImageCT) {
        if (failedList.length >= MAX_FAIL) return;
        failedList.push({
          index: failedList.length,
          filename,
          url: imgUrl,
          httpStatus: status,
          contentType: rawCT || '—',
          bodyPreview: previewText(buffer)
        });
        send({
          type: 'progressFail',
          countFail: failedList.length,
          filename,
          httpStatus: status
        });
        return;
      }

      // ── 成功：200–299 的 image/*，或有本體的 304
      if (okList.length >= MAX_OK) return;

      // 304 且無 body：快取命中，仍算「成功載入」，但不存 buffer
      if (status === 304 && (!buffer || buffer.length === 0)) {
        const dedupeKey = `304|${imgUrl}`;
        if (seenOkKeys.has(dedupeKey)) {
          duplicateHits++;
          return;
        }
        seenOkKeys.add(dedupeKey);
        okList.push({
          index: okList.length,
          filename,
          url: imgUrl,
          size: 0,
          contentType: contentType || 'image/*',
          buffer: null,
          httpStatus: 304,
          cacheOnly: true
        });
        send({
          type: 'progress',
          count: okList.length,
          filename,
          httpStatus: 304,
          note: '快取命中'
        });
        return;
      }

      if (!buffer || buffer.length === 0) return;
      if (buffer.length > MAX_BYTE) {
        send({ type: 'warn', message: `略過大圖（> 8 MB）：${filename}` });
        return;
      }

      const dedupeKey = `${filename}|${buffer.length}|${contentType}`;
      if (seenOkKeys.has(dedupeKey)) {
        duplicateHits++;
        send({
          type: 'status',
          message: `偵測重複圖片（${duplicateHits}）: ${filename}`
        });
        return;
      }
      seenOkKeys.add(dedupeKey);

      okList.push({
        index: okList.length,
        filename,
        url: imgUrl,
        size: buffer.length,
        contentType,
        buffer,
        httpStatus: status,
        cacheOnly: false
      });

      send({ type: 'progress', count: okList.length, filename, httpStatus: status });
    });

    send({ type: 'status', message: `正在載入頁面…` });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 40_000 });
    } catch (_e) { /* 略過 */ }

    send({ type: 'status', message: '捲動頁面觸發延遲載入圖片…' });

    try {
      await page.evaluate(async (scrollMaxMs) => {
        await new Promise((resolve) => {
          let scrolled = 0;
          const step   = 400;
          const timer  = setInterval(() => {
            window.scrollBy(0, step);
            scrolled += step;
            if (scrolled >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 120);
          setTimeout(() => { clearInterval(timer); resolve(); }, scrollMaxMs);
        });
      }, preset.SCROLL_MAX_MS);
    } catch (_e) { /* 略過 */ }

    const {
      QUIET_MS, MAX_WAIT_MS, MIN_PHASE_MS, DUP_EARLY_EXIT, DUP_HIT_END
    } = preset;

    const phaseStart        = Date.now();
    const startWaitAt       = phaseStart;
    let lastTickNotifiedSec = -1;

    while (true) {
      const now            = Date.now();
      const idleFor        = now - lastNewImageAt;
      const waited         = now - startWaitAt;
      const phaseElapsed   = now - phaseStart;
      const idleSec        = Math.floor(idleFor / 1000);
      const minPhaseMet    = phaseElapsed >= MIN_PHASE_MS;
      const idleQuietMet   = idleFor >= QUIET_MS;

      if (idleSec !== lastTickNotifiedSec) {
        const minHint = minPhaseMet
          ? ''
          : ` · 最少擷取 ${Math.floor(phaseElapsed / 1000)}s / ${Math.floor(MIN_PHASE_MS / 1000)}s`;
        send({
          type: 'status',
          message: `等待收斂：成功 ${okList.length}、失敗 ${failedList.length}，靜止 ${idleSec}s / ${Math.floor(QUIET_MS / 1000)}s${minHint}`
        });
        lastTickNotifiedSec = idleSec;
      }

      if (idleQuietMet && minPhaseMet) {
        send({ type: 'status', message: '已收斂：連續一段時間無新請求，結束等待。' });
        break;
      }
      if (DUP_EARLY_EXIT && duplicateHits >= DUP_HIT_END && idleFor >= 1200 && minPhaseMet) {
        send({ type: 'status', message: `已收斂：重複圖片達 ${duplicateHits} 次，提前結束。` });
        break;
      }
      if (waited >= MAX_WAIT_MS) {
        send({ type: 'status', message: '已達最長等待時間，結束擷取。' });
        break;
      }

      await page.waitForTimeout(300);
    }

    await browser.close();
    browser = null;

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { A: emptySide(), B: emptySide(), createdAt: Date.now() });
    }
    sessions.get(sessionId)[side] = { ok: okList, failed: failedList };

    const okMeta = okList.map(img => ({
      index:       img.index,
      filename:    img.filename,
      url:         img.url,
      size:        img.size,
      contentType: img.contentType,
      httpStatus:  img.httpStatus,
      cacheOnly:   !!img.cacheOnly,
      imgSrc:      img.buffer
        ? `/api/img/${sessionId}/${side}/${img.index}`
        : null
    }));

    const failedMeta = failedList.map(f => ({
      index:       f.index,
      filename:    f.filename,
      url:         f.url,
      httpStatus:  f.httpStatus,
      contentType: f.contentType,
      bodyPreview: f.bodyPreview
    }));

    send({
      type: 'done',
      ok: okMeta,
      failed: failedMeta,
      totalOk: okList.length,
      totalFailed: failedList.length
    });
    res.end();
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    send({ type: 'error', message: err.message });
    res.end();
  }
});

app.get('/api/img/:sessionId/:side/:idx', (req, res) => {
  const { sessionId, side, idx } = req.params;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).send('Session 不存在');
  const sideData = session[side];
  if (!sideData || !sideData.ok) return res.status(404).send('Side 不存在');
  const img = sideData.ok[parseInt(idx, 10)];
  if (!img || !img.buffer) return res.status(404).send('圖片不存在或為快取命中無本體');

  res.set('Content-Type', img.contentType);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(img.buffer);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log('\n🖼️  圖片比對工具已啟動');
  console.log(`   → 打開瀏覽器：http://localhost:${PORT}\n`);
});
