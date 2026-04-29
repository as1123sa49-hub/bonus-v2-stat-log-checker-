const TOOL_MAP = {
  'img-compare': {
    title: '圖片比對',
    url: '/apps/img-compare/',
    embeddable: true,
    steps: [
      '可填 A/B 兩個網址做比對；也可只填一個網址做單站檢視。',
      '選擇擷取模式：一般頁用「標準」、輪詢頁用「含列表輪詢」。',
      '點擊開始擷取，完成後查看總覽、載入狀態、資源大小、視覺比對。',
      '必要時匯出 CSV（含失敗清單）。'
    ]
  },
  'test-case-generator': {
    title: '測案產生器',
    url: '/apps/test-case-generator/',
    embeddable: true,
    steps: [
      '先選擇模式：新舊規格比對，或匯入Case比對新版。',
      '新舊規格模式：上傳新版 PDF（必要）與舊版 PDF（選填），可搭配快取版本。',
      '匯入Case模式：上傳新版 PDF + Baseline TestCase（CSV/XLSX，使用模板欄位）。',
      '視需要調整對應提示詞 Tab，點擊開始分析後檢查新增/失效/取代結果。',
      '確認結果後匯出 XLSX，交付 QA / 開發使用。'
    ]
  },
  'bonus-v2': {
    title: '500X 機率統計（Bonus V2）',
    url: '/apps/bonus-v2/',
    embeddable: true,
    steps: [
      '確認 500X 服務已啟動（預設 http://localhost:3001）。',
      '輸入遊戲網址與局數，點擊開始收集。',
      '等待 WebSocket 統計更新與局數達標。',
      '在 Bonus V2 頁面匯出統計 CSV / 明細 CSV。'
    ],
    command: 'cd tools/bonus-v2 && node verify-rates.js'
  },
  'front-log-checker': {
    title: '前端 LOG 驗證',
    url: '',
    embeddable: false,
    steps: [
      '此工具目前為攔截腳本，尚未提供獨立網頁 UI。',
      '在 Hub 複製完整腳本內容。',
      '到目標站台開 DevTools Console，直接貼上完整腳本。',
      '執行目標流程並觀察 LOG 是否符合規則。',
      '整理異常項目後回報。'
    ],
    command: 'node tools/front-log-checker/intercept.js',
    inlineScript: true
  },
  'front-log-compare': {
    title: 'LOG 結構比對',
    url: '/apps/front-log-compare/',
    embeddable: true,
    steps: [
      '先選執行模式：雙檔比對（舊版 vs 新版）或單檔驗證（欄位缺失）。',
      '雙檔比對：上傳舊版 + 新版 JSON（原始），可比對 jsondata 結構差異與 data/root 欄位差異。',
      '單檔驗證：上傳 1 份 JSON，先用「自動掃描欄位」勾選推薦，再套用到驗證欄位（支援 root. / data）。',
      '匹配鍵預設為 function_name + event（event 取值順序見工具內說明），可切換 function_name 或自訂欄位。',
      '開始比對後查看分頁結果：全部明細 / 缺失明細 / jsondata 摘要 / 欄位分組摘要，並可下載 CSV。'
    ]
  }
};

const toolTitle = document.getElementById('tool-title');
const btnReadme = document.getElementById('btn-readme');
const btnReload = document.getElementById('btn-reload');
const guide = document.getElementById('guide');
const embedWrap = document.getElementById('embed-wrap');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const readmeModal = document.getElementById('readme-modal');
const readmeTitle = document.getElementById('readme-title');
const readmeContent = document.getElementById('readme-content');
const readmeCloseBtn = document.getElementById('readme-close-btn');
const readmeCloseBackdrop = document.getElementById('readme-close-backdrop');

let currentTool = 'img-compare';
let frontLogScriptCache = '';
const toolFrames = new Map();

async function renderGuide(tool) {
  const data = TOOL_MAP[tool];
  const stepsHtml = data.steps.map((step) => `<li>${step}</li>`).join('');
  const commandHtml = data.command ? `<code>${data.command}</code>` : '';
  const loaderHtml = data.inlineScript
    ? `
      <div class="snippet-box">
        <div class="snippet-head">
          <strong>Console 完整腳本（直接貼上）</strong>
          <button id="btn-copy-loader" class="btn-copy">複製</button>
        </div>
        <textarea id="console-loader" readonly></textarea>
      </div>
    `
    : '';

  guide.innerHTML = `
    <h3>操作導引</h3>
    <ol>${stepsHtml}</ol>
    ${commandHtml}
    ${loaderHtml}
  `;

  if (data.inlineScript) {
    const textarea = document.getElementById('console-loader');
    const btnCopy = document.getElementById('btn-copy-loader');
    const script = await getFrontLogScriptText();
    textarea.value = script || '// 讀取 front-log-checker 腳本失敗，請確認 Hub server 正常。';
    btnCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(textarea.value);
        btnCopy.textContent = '已複製';
        setTimeout(() => { btnCopy.textContent = '複製'; }, 1200);
      } catch (_e) {
        textarea.select();
        document.execCommand('copy');
        btnCopy.textContent = '已複製';
        setTimeout(() => { btnCopy.textContent = '複製'; }, 1200);
      }
    });
  }
}

async function getFrontLogScriptText() {
  if (frontLogScriptCache) return frontLogScriptCache;
  const res = await fetch('/snippets/front-log-checker.txt', { cache: 'no-store' });
  if (!res.ok) throw new Error(`load failed: ${res.status}`);
  frontLogScriptCache = await res.text();
  return frontLogScriptCache;
}

async function renderTool(tool) {
  const data = TOOL_MAP[tool];
  currentTool = tool;
  toolTitle.textContent = data.title;
  await renderGuide(tool);

  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  if (data.embeddable && data.url) {
    embedWrap.style.display = 'block';
    btnReload.style.display = 'inline-block';
    showToolFrame(tool, data.url);
  } else {
    embedWrap.style.display = 'none';
    btnReload.style.display = 'none';
    hideAllFrames();
    embedWrap.innerHTML = '';
    toolFrames.clear();
  }
}

function hideAllFrames() {
  for (const frame of toolFrames.values()) {
    frame.style.display = 'none';
  }
}

function ensureToolFrame(tool, url) {
  if (!toolFrames.has(tool)) {
    const frame = document.createElement('iframe');
    frame.className = 'tool-frame';
    frame.title = `${tool}-frame`;
    frame.src = url;
    embedWrap.appendChild(frame);
    toolFrames.set(tool, frame);
    return frame;
  }

  const frame = toolFrames.get(tool);
  if (!frame.src.endsWith(url)) {
    frame.src = url;
  }
  if (!embedWrap.contains(frame)) {
    embedWrap.appendChild(frame);
  }
  return frame;
}

function showToolFrame(tool, url) {
  hideAllFrames();
  const frame = ensureToolFrame(tool, url);
  frame.style.display = 'block';
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function markdownToHtml(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const html = [];
  let inCodeBlock = false;
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        html.push('<pre><code>');
      } else {
        html.push('</code></pre>');
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (line.startsWith('# ')) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }

    if (line.startsWith('## ')) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith('### ')) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    if (!line.trim()) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push('<p></p>');
      continue;
    }

    if (inList) {
      html.push('</ul>');
      inList = false;
    }

    const withInlineCode = escapeHtml(line).replace(/`([^`]+)`/g, '<code>$1</code>');
    html.push(`<p>${withInlineCode}</p>`);
  }

  if (inList) html.push('</ul>');
  if (inCodeBlock) html.push('</code></pre>');
  return html.join('');
}

async function openReadmeModal() {
  const data = TOOL_MAP[currentTool];
  readmeTitle.textContent = `${data.title} 說明`;
  readmeContent.innerHTML = '<p>讀取中...</p>';
  readmeModal.classList.remove('hidden');
  readmeModal.setAttribute('aria-hidden', 'false');

  try {
    const res = await fetch(`/api/docs/${encodeURIComponent(currentTool)}`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`readme load failed: ${res.status}`);
    }
    const payload = await res.json();
    readmeContent.innerHTML = markdownToHtml(payload.markdown || '');
  } catch (_e) {
    const fallbackLines = [
      `## ${data.title}`,
      '',
      '目前讀不到 README.md，改為顯示工具內建操作導引：',
      '',
      ...((data.steps || []).map((step) => `- ${step}`))
    ];
    if (data.command) {
      fallbackLines.push('', '建議命令：', '', `\`${data.command}\``);
    }
    readmeContent.innerHTML = markdownToHtml(fallbackLines.join('\n'));
  }
}

function closeReadmeModal() {
  readmeModal.classList.add('hidden');
  readmeModal.setAttribute('aria-hidden', 'true');
}

btnReload.addEventListener('click', () => {
  const data = TOOL_MAP[currentTool];
  if (!data || !data.embeddable || !data.url) return;
  const frame = ensureToolFrame(currentTool, data.url);
  frame.src = data.url;
  frame.style.display = 'block';
});

navButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    await renderTool(btn.dataset.tool);
  });
});

btnReadme.addEventListener('click', openReadmeModal);
readmeCloseBtn.addEventListener('click', closeReadmeModal);
readmeCloseBackdrop.addEventListener('click', closeReadmeModal);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !readmeModal.classList.contains('hidden')) {
    closeReadmeModal();
  }
});

renderTool(currentTool);
