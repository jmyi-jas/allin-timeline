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
    PANEL_WIDTH: 215,
    PANEL_RIGHT: 12,
    PREVIEW_LEN: 150,
    ITEM_LABEL_LEN: 28,
    REFRESH_MS: 1800,
  };

  let panelEl = null;
  let tooltipEl = null;
  let lastHash = '';
  let currentMatchIndex = -1; // 当前选中的匹配项索引
  let matchedEls = [];        // 所有匹配项 { itemEl, msgEl, role }

  // ─────────────────────────────────────────────
  // DOM查找
  // ─────────────────────────────────────────────
  function findMessages() {
    const COMBINED_SELECTORS = [
      '[class*="space-y-2"][class*="rounded-xl"]',
      '[class*="self-end"][class*="flex-col"]',
    ];
    const seen = new Set();
    const all = [];
    for (const sel of COMBINED_SELECTORS) {
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

  // 转义正则特殊字符，防止用户输入破坏正则
  function escapeReg(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─────────────────────────────────────────────
  // 跳转逻辑（核心新增）
  // ─────────────────────────────────────────────
  function jumpToMatch(index) {
    if (matchedEls.length === 0) return;

    // 循环边界
    if (index < 0) index = matchedEls.length - 1;
    if (index >= matchedEls.length) index = 0;
    currentMatchIndex = index;

    const { itemEl, msgEl, role } = matchedEls[index];

    // 更新所有匹配项的视觉状态
    matchedEls.forEach(({ itemEl: el }, i) => {
      if (i === currentMatchIndex) {
        // 当前项：亮橙色高亮 + 边框
        el.style.background = 'rgba(255,167,38,0.22)';
        el.style.outline = '1px solid rgba(255,167,38,0.7)';
      } else {
        // 其他匹配项：恢复默认
        el.style.background = '';
        el.style.outline = '';
      }
    });

    // ① 面板内部滚动到当前条目
    itemEl.scrollIntoView({ block: 'nearest' });

    // ② 页面内容滚动到对应消息
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prevOutline = msgEl.style.outline;
    msgEl.style.outline = role === 'user' ? '2px solid #4fc3f7' : '2px solid #81c784';
    setTimeout(() => { msgEl.style.outline = prevOutline; }, 1600);

    updateCounter();
  }

  function updateCounter() {
    const hint = document.getElementById('xhs-tl-search-hint');
    if (!hint) return;
    const keyword = (document.getElementById('xhs-tl-search')?.value || '').trim();
    if (!keyword) {
      hint.style.display = 'none';
      return;
    }
    const total = matchedEls.length;
    if (total === 0) {
      hint.textContent = '无匹配结果';
      hint.style.color = '#ef9a9a';
    } else {
      // 显示 "当前 / 总数"
      const cur = currentMatchIndex >= 0 ? currentMatchIndex + 1 : '-';
      hint.textContent = `${cur} / ${total} 条匹配  (Enter↓  Shift+Enter↑)`;
      hint.style.color = '#81c784';
    }
    hint.style.display = 'block';
  }

  // ─────────────────────────────────────────────
  // 构建面板
  // ─────────────────────────────────────────────
  function buildPanel() {
    const style = document.createElement('style');
    style.textContent = `
      #xhs-tl-panel {
        position: fixed; top: 60px; right: ${CFG.PANEL_RIGHT}px;
        width: ${CFG.PANEL_WIDTH}px; max-height: calc(100vh - 80px);
        overflow-y: auto; background: rgba(18,18,28,0.93);
        backdrop-filter: blur(10px); border-radius: 12px;
        box-shadow: 0 6px 30px rgba(0,0,0,0.45);
        border: 1px solid rgba(255,255,255,0.09);
        z-index: 99999; padding: 10px 6px 12px;
        font-family: system-ui, sans-serif; font-size: 12px;
        color: #ccc; user-select: none;
      }
      /* 加宽滚动条，可拖动 */
      #xhs-tl-panel::-webkit-scrollbar { width: 6px; }
      #xhs-tl-panel::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.04); border-radius: 3px;
      }
      #xhs-tl-panel::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.28); border-radius: 3px;
      }
      #xhs-tl-panel::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.50);
      }
      #xhs-tl-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 6px 7px; border-bottom: 1px solid rgba(255,255,255,0.09);
        margin-bottom: 6px; color: #fff; font-size: 13px;
        font-weight: 600; cursor: move;
      }
      #xhs-tl-toggle { cursor: pointer; font-size: 15px; color: #888; }
      #xhs-tl-toggle:hover { color: #fff; }
      #xhs-tl-empty {
        color: #666; text-align: center; padding: 20px 8px;
        font-size: 11px; line-height: 1.8;
      }
      #xhs-tl-list { position: relative; padding-left: 14px; }
      #xhs-tl-list::before {
        content: ''; position: absolute; left: 17px; top: 6px;
        bottom: 6px; width: 1px; background: rgba(255,255,255,0.1);
      }
      .xhs-tl-item {
        display: flex; align-items: flex-start; gap: 8px;
        margin: 3px 2px; padding: 5px 6px 5px 4px;
        border-radius: 7px; cursor: pointer; transition: background 0.15s;
      }
      .xhs-tl-item:hover { background: rgba(255,255,255,0.09); }
      .xhs-tl-dot {
        flex-shrink: 0; width: 9px; height: 9px;
        border-radius: 50%; margin-top: 3px; border: 1.5px solid transparent;
      }
      .xhs-tl-dot.user    { background: #4fc3f7; border-color: #0288d1; }
      .xhs-tl-dot.ai      { background: #81c784; border-color: #388e3c; }
      .xhs-tl-dot.unknown { background: #aaa;    border-color: #666; }
      .xhs-tl-body { overflow: hidden; }
      .xhs-tl-label { font-size: 10px; color: #777; margin-bottom: 1px; }
      .xhs-tl-text {
        font-size: 11.5px; color: #bbb; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
        max-width: ${CFG.PANEL_WIDTH - 50}px; line-height: 1.5;
      }
      #xhs-tl-tooltip {
        position: fixed; max-width: 310px;
        background: rgba(12,12,22,0.97); color: #e0e0e0;
        font-size: 12px; line-height: 1.7; padding: 10px 13px;
        border-radius: 9px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        z-index: 100001; pointer-events: none; display: none;
        border: 1px solid rgba(255,255,255,0.1);
        white-space: pre-wrap; word-break: break-all;
      }
      /* 导航按钮 */
      .xhs-tl-nav-btn {
        flex-shrink: 0;
        width: 22px; height: 22px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 5px; cursor: pointer;
        color: #999; font-size: 13px;
        transition: background 0.15s, color 0.15s;
      }
      .xhs-tl-nav-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
    `;
    document.head.appendChild(style);

    panelEl = document.createElement('div');
    panelEl.id = 'xhs-tl-panel';

    // —— Header ——
    const header = document.createElement('div');
    header.id = 'xhs-tl-header';
    header.innerHTML = '<span>🗂 对话时间轴</span>';
    const toggle = document.createElement('span');
    toggle.id = 'xhs-tl-toggle';
    toggle.textContent = '−';
    header.appendChild(toggle);
    panelEl.appendChild(header);

    // —— 搜索区域 ——
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = `
      padding: 0 6px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.09);
      margin-bottom: 6px;
    `;

    // 搜索行：输入框 + ↑↓ 按钮
    const searchRow = document.createElement('div');
    searchRow.style.cssText = 'display:flex; align-items:center; gap:4px;';

    const searchInput = document.createElement('input');
    searchInput.id = 'xhs-tl-search';
    searchInput.placeholder = '🔍 搜索对话...';
    searchInput.style.cssText = `
      flex: 1; min-width: 0; box-sizing: border-box;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px; padding: 5px 8px;
      color: #ddd; font-size: 11.5px; outline: none;
      transition: border 0.2s;
    `;

    const prevBtn = document.createElement('div');
    prevBtn.className = 'xhs-tl-nav-btn';
    prevBtn.title = 'Shift+Enter  上一个';
    prevBtn.textContent = '↑';

    const nextBtn = document.createElement('div');
    nextBtn.className = 'xhs-tl-nav-btn';
    nextBtn.title = 'Enter  下一个';
    nextBtn.textContent = '↓';

    searchRow.appendChild(searchInput);
    searchRow.appendChild(prevBtn);
    searchRow.appendChild(nextBtn);
    searchWrap.appendChild(searchRow);

    // 计数提示
    const searchHint = document.createElement('div');
    searchHint.id = 'xhs-tl-search-hint';
    searchHint.style.cssText = `
      font-size: 10px; color: #666;
      padding: 4px 2px 0; display: none;
    `;
    searchWrap.appendChild(searchHint);
    panelEl.appendChild(searchWrap);

    // —— 列表 ——
    const list = document.createElement('div');
    list.id = 'xhs-tl-list';
    panelEl.appendChild(list);

    // 折叠
    let collapsed = false;
    toggle.addEventListener('click', () => {
      collapsed = !collapsed;
      list.style.display = collapsed ? 'none' : '';
      toggle.textContent = collapsed ? '+' : '−';
    });

    // 搜索：输入时重置索引并刷新
    searchInput.addEventListener('focus', () => {
      searchInput.style.border = '1px solid rgba(255,255,255,0.35)';
    });
    searchInput.addEventListener('blur', () => {
      searchInput.style.border = '1px solid rgba(255,255,255,0.12)';
    });
    searchInput.addEventListener('input', () => {
      searchInput.dataset.changed = '1';
      currentMatchIndex = -1;
      matchedEls = [];
      refreshTimeline();
    });

    // 键盘导航：Enter / Shift+Enter
    searchInput.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.shiftKey) {
        jumpToMatch(currentMatchIndex - 1);         // 上一个
      } else {
        jumpToMatch(currentMatchIndex < 0 ? 0 : currentMatchIndex + 1); // 下一个
      }
    });

    // 按钮点击
    nextBtn.addEventListener('click', () => {
      jumpToMatch(currentMatchIndex < 0 ? 0 : currentMatchIndex + 1);
    });
    prevBtn.addEventListener('click', () => {
      jumpToMatch(currentMatchIndex - 1);
    });

    document.body.appendChild(panelEl);

    // Tooltip
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'xhs-tl-tooltip';
    document.body.appendChild(tooltipEl);

    makeDraggable(panelEl, header);
  }

  // ─────────────────────────────────────────────
  // 拖动
  // ─────────────────────────────────────────────
  function makeDraggable(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      sx = e.clientX; sy = e.clientY;
      const rect = el.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      el.style.right = 'unset';
      el.style.left = ox + 'px';
      el.style.top  = oy + 'px';
      const onMove = ev => {
        el.style.left = (ox + ev.clientX - sx) + 'px';
        el.style.top  = (oy + ev.clientY - sy) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ─────────────────────────────────────────────
  // 刷新时间轴列表
  // ─────────────────────────────────────────────
  function refreshTimeline() {
    if (!panelEl) return;
    const msgs = findMessages();
    const list = document.getElementById('xhs-tl-list');
    const searchInput = document.getElementById('xhs-tl-search');
    if (!list) return;

    const hash = msgs.map((m, i) => i + ':' + getTextOf(m).slice(0, 15)).join('|');
    if (hash === lastHash && !searchInput?.dataset.changed) return;
    lastHash = hash;
    if (searchInput) searchInput.dataset.changed = '';

    list.innerHTML = '';

    if (msgs.length === 0) {
      const empty = document.createElement('div');
      empty.id = 'xhs-tl-empty';
      empty.textContent = '暂未检测到对话消息';
      list.appendChild(empty);
      updateCounter();
      return;
    }

    const keyword = (searchInput?.value || '').trim().toLowerCase();
    const prevIndex = currentMatchIndex;      // 刷新前记住旧索引
    const newMatchedEls = [];

    msgs.forEach((msgEl, idx) => {
      const text = getTextOf(msgEl);
      if (!text) return;
      const role = getRoleOf(msgEl);
      const matched = !keyword || text.toLowerCase().includes(keyword);

      const item = document.createElement('div');
      item.className = 'xhs-tl-item';

      // 不匹配项淡化且不可点
      if (keyword && !matched) {
        item.style.opacity = '0.22';
        item.style.pointerEvents = 'none';
      }

      // 收集匹配项
      if (keyword && matched) {
        newMatchedEls.push({ itemEl: item, msgEl, role });
      }

      // 圆点
      const dot = document.createElement('div');
      dot.className = 'xhs-tl-dot ' + role;

      // 文字区
      const body = document.createElement('div');
      body.className = 'xhs-tl-body';

      const label = document.createElement('div');
      label.className = 'xhs-tl-label';
      label.textContent =
        (role === 'user' ? '👤 你' : role === 'ai' ? '🤖 AI' : '❓') +
        '  #' + (idx + 1);

      const preview = document.createElement('div');
      preview.className = 'xhs-tl-text';

      if (keyword && matched) {
        const clipped = clip(text, CFG.ITEM_LABEL_LEN);
        const reg = new RegExp(`(${escapeReg(keyword)})`, 'gi');
        preview.innerHTML = clipped.replace(reg,
          '<span style="color:#ffd54f;font-weight:600">$1</span>');
      } else {
        preview.textContent = clip(text, CFG.ITEM_LABEL_LEN);
      }

      body.appendChild(label);
      body.appendChild(preview);
      item.appendChild(dot);
      item.appendChild(body);

      // Tooltip hover
      item.addEventListener('mouseenter', e => {
        const clipped = clip(text, CFG.PREVIEW_LEN);
        if (keyword && matched) {
          const reg = new RegExp(`(${escapeReg(keyword)})`, 'gi');
          tooltipEl.innerHTML = clipped.replace(reg,
            '<span style="color:#ffd54f;font-weight:600">$1</span>');
        } else {
          tooltipEl.textContent = clipped;
        }
        tooltipEl.style.display = 'block';
        moveTooltip(e);
      });
      item.addEventListener('mousemove', moveTooltip);
      item.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });

      // 点击：有搜索词时走 jumpToMatch，否则直接跳页面
      item.addEventListener('click', () => {
        if (keyword && matched) {
          // 先同步 matchedEls，再跳转
          matchedEls = newMatchedEls;
          const mi = matchedEls.findIndex(m => m.itemEl === item);
          if (mi >= 0) { jumpToMatch(mi); return; }
        }
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const prev = msgEl.style.outline;
        msgEl.style.outline = role === 'user' ? '2px solid #4fc3f7' : '2px solid #81c784';
        setTimeout(() => { msgEl.style.outline = prev; }, 1600);
      });

      list.appendChild(item);
    });

    // 同步全局 matchedEls
    matchedEls = newMatchedEls;

    // 刷新后恢复之前选中项的高亮（对话列表更新时不丢失状态）
    if (keyword && matchedEls.length > 0 && prevIndex >= 0) {
      currentMatchIndex = Math.min(prevIndex, matchedEls.length - 1);
      const { itemEl } = matchedEls[currentMatchIndex];
      itemEl.style.background = 'rgba(255,167,38,0.22)';
      itemEl.style.outline = '1px solid rgba(255,167,38,0.7)';
    } else if (!keyword) {
      currentMatchIndex = -1;
    }

    updateCounter();
  }

  function moveTooltip(e) {
    const panelRect = panelEl.getBoundingClientRect();
    let left = panelRect.left - 320 - 10;
    if (left < 8) left = 8;
    let top = e.clientY - 14;
    if (top + 130 > window.innerHeight) top = window.innerHeight - 138;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top  = top + 'px';
  }

  // ─────────────────────────────────────────────
  // 初始化
  // ─────────────────────────────────────────────
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
