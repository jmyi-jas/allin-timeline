(function () {
  'use strict';

  const CFG = {
    MSG_SELECTORS: [
      '[class*="space-y-2"][class*="rounded-xl"]',
      '[class*="self-end"][class*="flex-col"]',
      '[class*="space-y-2"]',
      '[class*="prose"]',
    ],
    USER_KEYWORDS: ['user', 'human', 'question', 'me', 'self', 'visitor'],
    AI_KEYWORDS: ['assistant', 'ai', 'bot', 'answer', 'response', 'model', 'agent'],
    SLIM_WIDTH: 20,
    FULL_WIDTH: 220,
    PANEL_RIGHT: 16,
    PREVIEW_LEN: 150,
    ITEM_LABEL_LEN: 28,
    REFRESH_MS: 1800,
  };

  let panelEl = null;
  let tooltipEl = null;
  let lastHash = '';

  /* ── 消息查找 ── */
  function findMessages() {
    const SELECTORS = [
      '[class*="space-y-2"][class*="rounded-xl"]',
      '[class*="self-end"][class*="flex-col"]',
    ];
    const seen = new Set();
    const all = [];
    for (const sel of SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!seen.has(el)) { seen.add(el); all.push(el); }
        });
      } catch (e) {}
    }
    all.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    return all;
  }

  /* ── 角色识别 ── */
  function getRoleOf(el) {
    const cls = (el.className || '').toLowerCase();
    if (cls.includes('self-end') || cls.includes('items-end')) return 'user';
    if (cls.includes('space-y-2') || cls.includes('prose')) return 'ai';
    const raw = [cls, el.getAttribute('data-role') || ''].join(' ');
    if (CFG.USER_KEYWORDS.some(k => raw.includes(k))) return 'user';
    if (CFG.AI_KEYWORDS.some(k => raw.includes(k))) return 'ai';
    let parent = el.parentElement;
    for (let i = 0; i < 5; i++) {
      if (!parent) break;
      const pr = (parent.className || '').toLowerCase();
      if (pr.includes('self-end') || pr.includes('items-end')) return 'user';
      if (CFG.AI_KEYWORDS.some(k => pr.includes(k))) return 'ai';
      parent = parent.parentElement;
    }
    return 'unknown';
  }

  function getTextOf(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function clip(str, len) {
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  /* ── 建面板 ── */
  function buildPanel() {
    const style = document.createElement('style');
    style.textContent = `
      /* ── 面板：默认收窄，hover展开 ── */
      #xhs-tl-panel {
        position: fixed;
        top: 50%;
        right: ${CFG.PANEL_RIGHT}px;
        transform: translateY(-50%);
        width: ${CFG.SLIM_WIDTH}px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        background: rgba(18, 18, 28, 0.82);
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.07);
        box-shadow: 0 4px 18px rgba(0,0,0,0.28);
        z-index: 99999;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 12px;
        color: #bbb;
        user-select: none;
        overflow: hidden;
        transition: width 0.28s cubic-bezier(0.4,0,0.2,1),
                    background 0.28s,
                    box-shadow 0.28s;
      }
      #xhs-tl-panel:hover {
        width: ${CFG.FULL_WIDTH}px;
        background: rgba(18, 18, 28, 0.95);
        box-shadow: 0 8px 28px rgba(0,0,0,0.40);
      }

      /* ── 标题：hover才显示 ── */
      #xhs-tl-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 10px 8px;
        flex-shrink: 0;
        opacity: 0;
        transition: opacity 0.2s 0.05s;
        white-space: nowrap;
      }
      #xhs-tl-panel:hover #xhs-tl-header {
        opacity: 1;
      }
      #xhs-tl-title {
        font-size: 12px;
        font-weight: 600;
        color: rgba(255,255,255,0.70);
        letter-spacing: 0.04em;
      }

      /* ── 搜索框：hover才显示 ── */
      #xhs-tl-search-wrap {
        padding: 0 10px 8px;
        flex-shrink: 0;
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        transition: opacity 0.2s 0.05s, max-height 0.25s;
      }
      #xhs-tl-panel:hover #xhs-tl-search-wrap {
        opacity: 1;
        max-height: 40px;
      }
      #xhs-tl-search {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 7px;
        padding: 5px 9px;
        color: #ddd;
        font-size: 11px;
        outline: none;
        transition: border 0.2s, background 0.2s;
      }
      #xhs-tl-search::placeholder { color: rgba(255,255,255,0.22); }
      #xhs-tl-search:focus {
        border-color: rgba(255,255,255,0.28);
        background: rgba(255,255,255,0.08);
      }

      /* ── 搜索结果提示 ── */
      #xhs-tl-search-hint {
        font-size: 10px;
        padding: 0 10px 5px;
        display: none;
        flex-shrink: 0;
      }

      /* ── 分割线 ── */
      #xhs-tl-divider {
        height: 1px;
        background: rgba(255,255,255,0.06);
        margin: 0 8px 4px;
        flex-shrink: 0;
        opacity: 0;
        transition: opacity 0.2s 0.05s;
      }
      #xhs-tl-panel:hover #xhs-tl-divider { opacity: 1; }

      /* ── 列表 ── */
      #xhs-tl-list {
        overflow-y: auto;
        overflow-x: hidden;
        padding: 4px 4px 10px;
        position: relative;
        flex: 1;
      }
      #xhs-tl-list::-webkit-scrollbar { width: 2px; }
      #xhs-tl-list::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.10);
        border-radius: 2px;
      }

      /* ── 竖线：始终可见 ── */
      #xhs-tl-list::before {
        content: '';
        position: absolute;
        left: 10px;
        top: 6px;
        bottom: 6px;
        width: 1px;
        background: linear-gradient(
          to bottom,
          transparent,
          rgba(255,255,255,0.12) 12%,
          rgba(255,255,255,0.12) 88%,
          transparent
        );
        pointer-events: none;
      }

      /* ── 空状态 ── */
      #xhs-tl-empty {
        color: rgba(255,255,255,0.2);
        text-align: center;
        padding: 16px 8px;
        font-size: 11px;
        line-height: 2;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.2s 0.05s;
      }
      #xhs-tl-panel:hover #xhs-tl-empty { opacity: 1; }

      /* ── 每条消息 ── */
      .xhs-tl-item {
        display: flex;
        align-items: center;
        gap: 0;
        padding: 5px 4px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s;
        overflow: hidden;
      }
      .xhs-tl-item:hover { background: rgba(255,255,255,0.07); }
      .xhs-tl-item:active { background: rgba(255,255,255,0.12); }

      /* ── 圆点：始终可见，hover时放大 ── */
      .xhs-tl-dot {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-left: 2px;
        margin-right: 0;
        transition: transform 0.18s, margin-right 0.28s;
      }
      .xhs-tl-item:hover .xhs-tl-dot { transform: scale(1.4); }

      #xhs-tl-panel:hover .xhs-tl-dot {
        margin-right: 9px;
      }

      .xhs-tl-dot.user    { background: #4fc3f7; box-shadow: 0 0 5px rgba(79,195,247,0.5); }
      .xhs-tl-dot.ai      { background: #81c784; box-shadow: 0 0 5px rgba(129,199,132,0.5); }
      .xhs-tl-dot.unknown { background: rgba(255,255,255,0.22); }

      /* ── 文字区：hover才显示 ── */
      .xhs-tl-body {
        overflow: hidden;
        opacity: 0;
        max-width: 0;
        transition: opacity 0.18s 0.06s, max-width 0.28s;
        white-space: nowrap;
      }
      #xhs-tl-panel:hover .xhs-tl-body {
        opacity: 1;
        max-width: 180px;
      }

      .xhs-tl-label {
        font-size: 9.5px;
        color: rgba(255,255,255,0.28);
        margin-bottom: 1px;
        letter-spacing: 0.02em;
      }
      .xhs-tl-text {
        font-size: 11px;
        color: rgba(255,255,255,0.52);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 170px;
        line-height: 1.5;
        transition: color 0.15s;
      }
      .xhs-tl-item:hover .xhs-tl-text { color: rgba(255,255,255,0.85); }

      /* ── 不匹配变暗 ── */
      .xhs-tl-item.dimmed {
        opacity: 0.18;
        pointer-events: none;
      }

      /* ── 悬浮预览 ── */
      #xhs-tl-tooltip {
        position: fixed;
        max-width: 300px;
        background: rgba(10, 10, 18, 0.96);
        color: rgba(255,255,255,0.82);
        font-size: 12px;
        line-height: 1.75;
        padding: 10px 14px;
        border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.45);
        z-index: 100001;
        pointer-events: none;
        display: none;
        border: 1px solid rgba(255,255,255,0.07);
        white-space: pre-wrap;
        word-break: break-all;
        font-family: system-ui, sans-serif;
      }
    `;
    document.head.appendChild(style);

    /* 面板主体 */
    panelEl = document.createElement('div');
    panelEl.id = 'xhs-tl-panel';

    /* 标题栏 */
    const header = document.createElement('div');
    header.id = 'xhs-tl-header';
    const title = document.createElement('span');
    title.id = 'xhs-tl-title';
    title.textContent = '对话时间轴';
    header.appendChild(title);
    panelEl.appendChild(header);

    /* 搜索框 */
    const searchWrap = document.createElement('div');
    searchWrap.id = 'xhs-tl-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.id = 'xhs-tl-search';
    searchInput.type = 'text';
    searchInput.placeholder = '🔍  搜索对话内容…';
    searchWrap.appendChild(searchInput);
    panelEl.appendChild(searchWrap);

    /* 搜索提示 */
    const searchHint = document.createElement('div');
    searchHint.id = 'xhs-tl-search-hint';
    panelEl.appendChild(searchHint);

    /* 分割线 */
    const divider = document.createElement('div');
    divider.id = 'xhs-tl-divider';
    panelEl.appendChild(divider);

    /* 列表 */
    const list = document.createElement('div');
    list.id = 'xhs-tl-list';
    panelEl.appendChild(list);

    document.body.appendChild(panelEl);

    /* 悬浮提示 */
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'xhs-tl-tooltip';
    document.body.appendChild(tooltipEl);

    /* 搜索实时触发 */
    searchInput.addEventListener('input', () => {
      searchInput.dataset.changed = '1';
      refreshTimeline();
    });
    searchInput.addEventListener('mousedown', e => e.stopPropagation());
  }

  /* ── 刷新时间轴 ── */
  function refreshTimeline() {
    if (!panelEl) return;
    const msgs = findMessages();
    const list = document.getElementById('xhs-tl-list');
    const searchInput = document.getElementById('xhs-tl-search');
    const searchHint = document.getElementById('xhs-tl-search-hint');
    if (!list) return;

    const hash = msgs.map((m, i) => i + ':' + getTextOf(m).slice(0, 15)).join('|');
    if (hash === lastHash && !searchInput?.dataset.changed) return;
    lastHash = hash;
    if (searchInput) searchInput.dataset.changed = '';

    list.innerHTML = '';

    if (msgs.length === 0) {
      const empty = document.createElement('div');
      empty.id = 'xhs-tl-empty';
      empty.textContent = '暂无对话消息';
      list.appendChild(empty);
      return;
    }

    const keyword = (searchInput?.value || '').trim().toLowerCase();
    let matchCount = 0;

    msgs.forEach((msgEl, idx) => {
      const text = getTextOf(msgEl);
      if (!text) return;
      const role = getRoleOf(msgEl);
      const matched = !keyword || text.toLowerCase().includes(keyword);
      if (keyword && matched) matchCount++;

      const item = document.createElement('div');
      item.className = 'xhs-tl-item' + (keyword && !matched ? ' dimmed' : '');

      const dot = document.createElement('div');
      dot.className = 'xhs-tl-dot ' + role;

      const body = document.createElement('div');
      body.className = 'xhs-tl-body';

      const label = document.createElement('div');
      label.className = 'xhs-tl-label';
      label.textContent = (role === 'user' ? '👤 你' : role === 'ai' ? '🤖 AI' : '❓')
        + ' · ' + (idx + 1);

      const preview = document.createElement('div');
      preview.className = 'xhs-tl-text';
      const clipped = clip(text, CFG.ITEM_LABEL_LEN);

      if (keyword && matched) {
        const reg = new RegExp(
          `(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'
        );
        preview.innerHTML = clipped.replace(reg,
          '<span style="color:#ffd54f;font-weight:600">$1</span>'
        );
      } else {
        preview.textContent = clipped;
      }

      body.appendChild(label);
      body.appendChild(preview);
      item.appendChild(dot);
      item.appendChild(body);

      /* 悬浮预览 */
      item.addEventListener('mouseenter', e => {
        const full = clip(text, CFG.PREVIEW_LEN);
        if (keyword && matched) {
          const reg = new RegExp(
            `(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'
          );
          tooltipEl.innerHTML = full.replace(reg,
            '<span style="color:#ffd54f;font-weight:600">$1</span>'
          );
        } else {
          tooltipEl.textContent = full;
        }
        tooltipEl.style.display = 'block';
        moveTooltip(e);
      });
      item.addEventListener('mousemove', moveTooltip);
      item.addEventListener('mouseleave', () => {
        tooltipEl.style.display = 'none';
      });

      /* 点击跳转 */
      item.addEventListener('click', () => {
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const prev = msgEl.style.outline;
        msgEl.style.transition = 'outline 0.1s';
        msgEl.style.outline = role === 'user'
          ? '2px solid rgba(79,195,247,0.8)'
          : '2px solid rgba(129,199,132,0.8)';
        setTimeout(() => { msgEl.style.outline = prev; }, 1600);
      });

      list.appendChild(item);
    });

    /* 搜索提示 */
    if (searchHint) {
      if (keyword) {
        searchHint.textContent = matchCount > 0
          ? `找到 ${matchCount} 条匹配`
          : '无匹配结果';
        searchHint.style.display = 'block';
        searchHint.style.color = matchCount > 0
          ? 'rgba(129,199,132,0.75)'
          : 'rgba(239,154,154,0.75)';
      } else {
        searchHint.style.display = 'none';
      }
    }
  }

  function moveTooltip(e) {
    const panelRect = panelEl.getBoundingClientRect();
    let left = panelRect.left - 310 - 10;
    if (left < 8) left = 8;
    let top = e.clientY - 14;
    if (top + 140 > window.innerHeight) top = window.innerHeight - 148;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top  = top  + 'px';
  }

  /* ── 初始化 ── */
  function init() {
    if (document.getElementById('xhs-tl-panel')) return;
    buildPanel();
    new MutationObserver(() => refreshTimeline())
      .observe(document.body, { childList: true, subtree: true });
    setInterval(() => {
      if (!document.getElementById('xhs-tl-panel')) buildPanel();
      refreshTimeline();
    }, CFG.REFRESH_MS);
    [500, 1500, 3000, 5000, 8000].forEach(t => setTimeout(refreshTimeline, t));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2500));
  } else {
    setTimeout(init, 2500);
  }
})();
