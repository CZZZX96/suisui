// ===== 随遂 App — 数据驱动渲染 + 本地持久化 =====
(() => {
  const DB = window.SuiDB;
  DB.load();

  // 当前正在查看的报告（用于归档跳转）
  const _p2 = (n) => String(n).padStart(2, '0');
  // 北京时间（Asia/Shanghai，UTC+8，无夏令时）：不论设备时区，返回一个其本地读取器（getFullYear/getMonth/getDate/getDay/getHours/getMinutes）都对应北京墙钟时间的 Date 对象
  const _BJ_OFFSET_MIN = 8 * 60;
  function bjNow() {
    const n = new Date();
    return new Date(n.getTime() + (n.getTimezoneOffset() + _BJ_OFFSET_MIN) * 60000);
  }
  // 给定一个日期字符串/Date，返回该时刻对应的"北京时间 Date"（仅日期类字段同步，时分秒保留原值，便于跨日期比较）
  function bjDateOf(input) {
    const d = input instanceof Date ? new Date(input.getTime()) : new Date(input + (input.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return d;
    return new Date(d.getTime() + (d.getTimezoneOffset() + _BJ_OFFSET_MIN) * 60000);
  }
  const _wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const todayISO = () => { const d = bjNow(); return `${d.getFullYear()}-${_p2(d.getMonth() + 1)}-${_p2(d.getDate())}`; };
  const TODAY = todayISO();
  const YEST = (() => { const d = bjNow(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${_p2(d.getMonth() + 1)}-${_p2(d.getDate())}`; })();
  const state = { weeklyNote: 'wn30', weeklyBill: 'wb30', monthly: 'mb7', curNoteMonth: TODAY.slice(0, 7) };

  // ---------- 小工具 ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function nowHM() {
    const d = bjNow();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function fmtMoney(n) {
    return (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function setText(sel, txt) { const el = $(sel); if (el) el.textContent = txt; }
  // 通用确认弹层：返回 Promise<boolean>，点击「确认」resolve(true)
  function showConfirm(title, msg, onOk) {
    const mask = $('#confirmMask');
    if (!mask) { if (window.confirm(title + '\n' + msg)) onOk && onOk(); return; }
    setText('#confirmTitle', title);
    setText('#confirmMsg', msg);
    const ok = $('#confirmOk'), cancel = $('#confirmCancel');
    const close = () => { mask.hidden = true; ok.onclick = null; cancel.onclick = null; mask.onclick = null; };
    ok.onclick = () => { close(); if (onOk) onOk(); };
    cancel.onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    mask.hidden = false;
  }
  function monthLabel(k) { const p = (k || '').split('-'); return p.length === 2 ? `${p[0]} 年 ${parseInt(p[1], 10)} 月` : k; }
  // 周区间 -> 2026.7.13-2026.7.19 完整年形式
  function fullWeekRange(range) {
    const m = String(range || '').match(/(\d{1,2})\.(\d{1,2})\s*[–\-]\s*(\d{1,2})\.(\d{1,2})/);
    return m ? `2026.${m[1]}.${m[2]}-2026.${m[3]}.${m[4]}` : (range || '');
  }
  function weekdayName(dateStr) {
    const d = bjDateOf(dateStr);
    return _wd[d.getDay()];
  }
  function fmtDateLong(dateStr) {
    if (!dateStr) return '';
    const d = bjDateOf(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${_wd[d.getDay()]}`;
  }
  function monthShort(dateStr) {
    if (!dateStr) return '';
    const d = bjDateOf(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  function todayLabel(dateStr) {
    if (dateStr === TODAY) return '今天';
    if (dateStr === YEST) return '昨天';
    return null;
  }
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); }, 2200);
  }

  // ---------- 图标 ----------
  const checkSvg = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="m2.5 5.5 2 2L8.5 3" stroke="#3D8A5A" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const arrowSvg = (c) => `<svg class="arc-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="m6 4 4 4-4 4" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const clockGreen = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#fff" stroke-width="1.2"/><path d="M7 4v3l2 1.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>';
  const clockWhite = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#fff" stroke-width="1.1"/><path d="M6 3.5v3l1.5 1.2" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/></svg>';
  const videoPlay = '<div class="video-play"><span><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6 4.5 13 9l-7 4.5z" fill="#fff"/></svg></span></div>';
  const starSvg = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.6 3.3L12 5l-2.5 2.4.6 3.5L7 9.2 3.9 10.9l.6-3.5L2 5l3.4-.7z" fill="#B08968"/></svg>';

  const catColor = {
    餐饮: '#D08068', 交通: '#4A7BC4', 购物: '#9B6BB0', 娱乐: '#C9A23B',
    居家: '#B08968', 医疗: '#E58FA0', 学习: '#3D8A5A', 人情: '#9B6BB0',
    兼职: '#3D8A5A', 收入: '#3D8A5A'
  };
  function catIcon(name, color, size = 20) {
    const c = color || catColor[name] || '#6D6C6A';
    const paths = {
      餐饮: `<path d="M5 7h10l-1 9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 7V5a3 3 0 0 1 6 0v2" stroke="${c}" stroke-width="1.6"/>`,
      交通: `<rect x="2.5" y="5.5" width="15" height="9" rx="1.5" stroke="${c}" stroke-width="1.6"/><circle cx="6" cy="13" r="1.2" fill="${c}"/><circle cx="14" cy="13" r="1.2" fill="${c}"/><path d="M7 5.5h6" stroke="${c}" stroke-width="1.6"/>`,
      购物: `<path d="M5 7h10v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 7V5h10v2" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 10v4M12 10v4" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
      娱乐: `<circle cx="10" cy="10" r="6" stroke="${c}" stroke-width="1.6"/><path d="M10 7v2M10 13h.01M8 10.5a2 2 0 0 1 4 0c0 1.5-2 1.5-2 3" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
      居家: `<path d="M3 10 10 4l7 7v7H3z" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 17v-4h4v4" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
      医疗: `<path d="M10 17s-7-5-7-10a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 5-7 10-7 10z" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10h6" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
      学习: `<path d="M2 9 10 6l8 3-8 3z" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 11v4c0 1.5 10 1.5 10 0v-4M4 13v2M16 13v2" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
      人情: `<path d="m10 2 2.2 4.5 5 1-3.6 3.5.9 5L10 13.4 5.5 16l.9-5L3 7.5l5-1z" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
      兼职: `<path d="M10 3v14M5 7h10" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="13" r="5" stroke="${c}" stroke-width="1.6"/>`,
      收入: `<path d="M10 3v14M5 7h10" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="13" r="5" stroke="${c}" stroke-width="1.6"/>`
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none">${paths[name] || paths['餐饮']}</svg>`;
  }

  // ---------- 渲染：屏 1 随手记录 ----------
  function legacyMedia(n) {
    if (n.photo) return [{ kind: n.type === 'video' ? 'video' : 'image', src: n.photo, dur: n.dur }];
    if (n.svg) return [{ kind: 'drawing', svg: n.svg }];
    return [];
  }
  function mediaBlock(m) {
    if (m.svg) return `<div class="doodle-canvas"><svg viewBox="0 0 280 90" preserveAspectRatio="xMidYMid meet">${m.svg}</svg></div>`;
    if (m.src) {
      if (m.kind === 'image') return `<img class="card-photo-img" src="${esc(m.src)}" alt="" loading="lazy">`;
      if (m.kind === 'video') return `<div class="video-thumb" style="background-image:url('${esc(m.src)}')">${videoPlay}<span class="video-dur">${esc(m.dur || '')}</span></div>`;
      if (m.kind === 'drawing') return `<img class="doodle-img" src="${esc(m.src)}" alt="涂鸦"/>`;
    }
    if (m.mediaId) {
      if (m.kind === 'image') return `<img class="card-photo-img" data-media-kind="image" data-media-id="${esc(m.mediaId)}" alt="" loading="lazy">`;
      if (m.kind === 'video') return `<div class="card-video-wrap"><video class="card-video" controls playsinline data-media-kind="video" data-media-id="${esc(m.mediaId)}"></video>${m.dur ? `<span class="video-dur-pill">${esc(m.dur)}</span>` : ''}</div>`;
      if (m.kind === 'drawing') return `<img class="doodle-img" data-media-kind="drawing" data-media-id="${esc(m.mediaId)}" alt="涂鸦"/>`;
    }
    return '';
  }
  function noteCard(n) {
    const media = n.media && n.media.length ? n.media : legacyMedia(n);
    const pin = n.pinned ? '<span class="card-pin">置顶</span>' : '';
    const sig = `<div class="signature"><span class="sig-time">${esc(n.time)}</span><span class="sig-dot">·</span><span class="sig-place">${esc(n.place)}</span></div>`;
    const body = n.body ? `<p class="card-body">${esc(n.body)}</p>` : '';
    return `<article class="card" data-id="${esc(n.id)}">${pin}${body}${media.map(mediaBlock).join('')}${sig}</article>`;
  }
  function resolveMedia(root) {
    root = root || document;
    $$('[data-media-id]', root).forEach(async (el) => {
      const url = await SuiDB.mediaURL(el.dataset.mediaId);
      if (!url) return;
      if (el.tagName === 'VIDEO') el.src = url;
      else if (el.tagName === 'IMG') el.src = url;
      else el.style.backgroundImage = `url('${url}')`;
    });
  }
  let s1Query = '';
  function noteMatches(n, q) {
    if (!q) return true;
    const hay = ((n.body || '') + ' ' + (n.place || '') + ' ' + (n.category || '')).toLowerCase();
    return hay.includes(q);
  }
  function renderS1Notes() {
    const q = s1Query.trim().toLowerCase();
    const monthNotes = DB.notesByMonth(state.curNoteMonth);
    const notes = monthNotes.filter((n) => noteMatches(n, q));
    // 收集该月内出现过的日期，倒序排列
    const byDate = {};
    notes.forEach((n) => { (byDate[n.date] = byDate[n.date] || []).push(n); });
    const dates = Object.keys(byDate).sort().reverse();
    let html = '';
    dates.forEach((date) => {
      const list = byDate[date].slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      const prefix = todayLabel(date) || '';
      const title = prefix ? `${prefix} · ${monthShort(date)}` : monthShort(date);
      html += `<div class="section-label">${esc(title)}</div>`;
      list.forEach((n) => (html += noteCard(n)));
    });
    if (!html) html = '<div class="s4-empty">' + (q ? '没有找到匹配「' + esc(s1Query) + '」的手记' : (DB.notesByMonth(state.curNoteMonth).length ? '本月暂无手记' : '该月份没有手记，去底部"+"写下第一条吧')) + '</div>';
    const box = $('#s1-notes');
    box.innerHTML = html;
    resolveMedia(box);
  }
  function renderS1MonthLabel() { setText('#s1-month-label', monthLabel(state.curNoteMonth)); }
  // ---------- 通用：左上角内联小字下拉（点击其他区域自动收起） ----------
  function closeAllDrops() { $$('.inline-drop').forEach((d) => { d.hidden = true; }); }
  function toggleDrop(drop, builder) {
    if (!drop) return;
    if (!drop.hidden) { drop.hidden = true; return; }
    closeAllDrops();
    builder();
    drop.hidden = false;
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('.inline-drop') || e.target.closest('[data-drop-btn]')) return;
    closeAllDrops();
  }, true);
  function buildS1MonthDrop() {
    const list = DB.noteMonthKeys();
    if (!list.includes(state.curNoteMonth)) list.unshift(state.curNoteMonth);
    const box = $('#s1-month-drop');
    if (box) box.innerHTML = list.map((k) => `<button type="button" class="drop-item ${k === state.curNoteMonth ? 'active' : ''}" data-m="${k}">${esc(monthLabel(k))}</button>`).join('');
  }
  // 屏 1 周报归档已搬到屏 3
  function renderS1Archive() { /* 屏1不再显示往期周报 */ }

  // ---------- 渲染：屏 3 周整理报告 ----------
  const NOTE_CATS = [
    { k: 'inspiration', name: '创作灵感', color: '#3D8A5A' },
    { k: 'life', name: '生活事项', color: '#D08068' },
    { k: 'thought', name: '想法状态', color: '#B08968' },
    { k: 'free', name: '随心记录', color: '#9B6BB0' }
  ];
  function catNameOf(k) { const c = NOTE_CATS.find((x) => x.k === k); return c ? c.name : '随心记录'; }
  function catColorOf(k) { const c = NOTE_CATS.find((x) => x.k === k); return c ? c.color : '#9B6BB0'; }
  function catKOf(name) { const c = NOTE_CATS.find((x) => x.name === name); return c ? c.k : 'free'; }
  // 由真实手记实时聚合（图片+视频合并为"附图频"），严格按该周区间筛选，绝不回退到其他周
  function computeWeekNoteReport(r) {
    let sd, ed;
    if (r.sd && r.ed) { sd = r.sd; ed = r.ed; }
    else {
      const m = String(r.range || '').match(/(\d{1,2})\.(\d{1,2})\s*[–\-]\s*(\d{1,2})\.(\d{1,2})/);
      if (!m) return r;
      const y = String(new Date().getFullYear());
      sd = `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
      ed = `${y}-${String(m[3]).padStart(2, '0')}-${String(m[4]).padStart(2, '0')}`;
    }
    const notes = DB.data.notes.filter((n) => n.date >= sd && n.date <= ed);
    let images = 0, doodles = 0;
    const stats = { inspiration: 0, life: 0, thought: 0, free: 0 };
    // 按分类聚合：items 存【日期·周几 时间 + 文本】供手风琴展示
    const byCat = { inspiration: [], life: [], thought: [], free: [] };
    notes.forEach((n) => {
      const arr = (n.media && n.media.length) ? n.media : legacyMedia(n);
      arr.forEach((mm) => { if (mm.kind === 'video' || mm.kind === 'image') images++; else if (mm.kind === 'drawing') doodles++; });
      const k = catKOf(n.category);
      stats[k] = (stats[k] || 0) + 1;
      const day = (n.date ? monthShort(n.date) : '') + ' · ' + (n.date ? weekdayName(n.date) : '') + ' ' + ((n.time || '').slice(0, 5));
      const text = (n.body || '').slice(0, 60) || ((n.media && n.media.length) ? '【' + (n.media[0].kind === 'video' ? '视频' : n.media[0].kind === 'drawing' ? '涂鸦' : '图片') + '】' : '（空白手记）');
      byCat[k].push({ day, text });
    });
    // 关键词：对用户手记做有意义的主题提炼（非逐字抓取），最多 6 个
    const keywords = (r.userKeywords && r.userKeywords.length) ? r.userKeywords : generateKeywords(notes);
    const cats = NOTE_CATS.map((c) => ({
      name: c.name, color: c.color,
      count: (byCat[c.k] || []).length,
      items: (byCat[c.k] || []).slice(0, 8)
    }));
    return Object.assign({}, r, {
      total: notes.length, images, doodles, stats, categories: cats, keywords
    });
  }
  const STOP = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '和', '与', '及', '或', '也', '都', '还', '就', '把', '被', '让', '使', '而', '但', '啊', '哦', '嗯', '呢', '吧', '吗', '啦', '嘛', '一个', '一些', '我们', '你们', '他们', '这个', '那个', '今天', '明天', '昨天', '现在', '以前', '以后', '所以', '因为', '如果', '虽然', '然后']);
  // 关键词词库：从手记正文中提炼有意义的主题词（非逐字抓取），最多 6 个
  const KW_LEXICON = [
    { k: '咖啡', hits: ['咖啡','拿铁','美式','卡布','馥芮','cafe','星巴克','瑞幸'] },
    { k: '美食', hits: ['美食','好吃','餐厅','火锅','烧烤','料理','吃饭','大餐','甜点','蛋糕','面包','宵夜'] },
    { k: '读书', hits: ['读书','阅读','书本','小说','kindle','Kindle','看書'] },
    { k: '学习', hits: ['学习','课程','上课','考研','考试','笔记','英语','复习'] },
    { k: '工作', hits: ['工作','开会','会议','项目','加班','汇报','老板','同事','办公室','出差'] },
    { k: '旅行', hits: ['旅行','旅游','出游','景点','机票','酒店','民宿','自驾','度假'] },
    { k: '运动', hits: ['运动','健身','跑步','瑜伽','游泳','打球','锻炼','夜跑'] },
    { k: '电影', hits: ['电影','影院','观影','追剧','剧集'] },
    { k: '音乐', hits: ['音乐','听歌','演唱会','吉他','钢琴'] },
    { k: '心情', hits: ['心情','开心','难过','焦虑','平静','快乐','幸福','emo','治愈'] },
    { k: '朋友', hits: ['朋友','闺蜜','聚会','约饭','聊天','兄弟'] },
    { k: '家人', hits: ['家人','爸妈','父母','孩子','家庭','回家','外婆','爷爷'] },
    { k: '周末', hits: ['周末','放假','休息','悠闲'] },
    { k: '计划', hits: ['计划','目标','打算','安排','规划'] },
    { k: '自然', hits: ['公园','花','日落','风景','散步','海边','森林'] },
    { k: '宠物', hits: ['猫','狗','宠物','喵','汪'] },
    { k: '健康', hits: ['身体','感冒','医院','睡眠','养生'] },
    { k: '购物', hits: ['买','购物','下单','快递','淘宝','京东'] },
    { k: '灵感', hits: ['灵感','想法','创意','点子'] }
  ];
  function generateKeywords(notes) {
    const text = (notes || []).map((n) => (n.body || '')).join(' ');
    const count = {};
    KW_LEXICON.forEach((e) => {
      let c = 0;
      e.hits.forEach((h) => { if (h) c += text.split(h).length - 1; });
      if (c > 0) count[e.k] = c;
    });
    let res = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
    if (res.length < 4) {
      ['灵感','生活','思考','自由记录'].forEach((c) => { if (res.length < 6 && !res.includes(c)) res.push(c); });
    }
    return res;
  }
  function renderS3() {
    const raw = DB.data.weeklyNoteReports.find((x) => x.id === state.weeklyNote) || DB.data.weeklyNoteReports[0];
    const r = computeWeekNoteReport(raw);
    const stats = NOTE_CATS
      .map(
        (d) => `<button type="button" class="stat-card stat-click" data-cat-key="${d.k}">
          <div class="stat-num" style="color:${d.color}">${r.stats[d.k]}</div>
          <div class="stat-label">${d.name}</div>
        </button>`
      )
      .join('');
    const cats = r.categories
      .map(
        (c, ci) => `<div class="cat-card" data-cat="${ci}">
          <div class="cat-head" data-cat-toggle="${ci}">
            <span class="cat-dot" style="background:${c.color}"></span><span class="cat-name">${esc(c.name)}</span><span class="cat-count">${c.count} 条</span><span class="cat-chevron">▾</span>
          </div>
          <div class="cat-items">
            ${c.items
              .map(
                (it) => `<div class="cat-item"><div class="cat-day">${esc(it.day)}</div><div class="cat-text">${esc(it.text)}</div></div>`
              )
              .join('')}
          </div>
        </div>`
      )
      .join('');
    const kw = r.keywords.map((k, i) => `<button type="button" class="kw-chip" data-idx="${i}" data-kw="${esc(k)}">${esc(k)}<span class="kw-x" aria-label="删除">×</span></button>`).join('');
    setText('#s3-week-label', r.week);
    $('#s3-report').innerHTML = `
      <div class="s3-hero">
        <div class="s3-hero-badge">${clockGreen} 每周一 9:00 自动生成</div>
        <h3 class="s3-hero-title">${r.week}手记整理</h3>
        <div class="s3-hero-date">${fullWeekRange(r.range)}</div>
        <div class="s3-hero-sub">共记录 ${r.total} 条手记 · 附图频 ${r.images} 张 · 涂鸦 ${r.doodles} 幅</div>
      </div>
      <div class="s3-stats">${stats}</div>
      ${cats}
      <div class="s3-keywords"><div class="kw-title">本周关键词<button type="button" class="kw-add" id="kw-add" aria-label="添加关键词">＋</button></div><div class="kw-chips">${kw}</div></div>`;
  }
  function buildS3WeekDrop() {
    const list = DB.data.weeklyNoteReports;
    const box = $('#s3-week-drop');
    if (box) box.innerHTML = list.map((r) => `<button type="button" class="drop-item ${r.id === state.weeklyNote ? 'active' : ''}" data-w="${r.id}">${esc(r.week)} · ${esc(r.range)}</button>`).join('');
  }
  function buildS6WeekDrop() {
    const list = DB.data.weeklyBillReports;
    const box = $('#s6-week-drop');
    if (box) box.innerHTML = list.map((r) => `<button type="button" class="drop-item ${r.id === state.weeklyBill ? 'active' : ''}" data-dw="${r.id}">${esc(r.week)} · ${esc(r.range)}</button>`).join('');
  }
  function buildS7MonthDrop() {
    const list = DB.data.monthlyBillReports;
    const box = $('#s7-month-drop');
    if (box) box.innerHTML = list.map((r) => `<button type="button" class="drop-item ${r.id === state.monthly ? 'active' : ''}" data-dm="${r.id}">${esc(r.month)}</button>`).join('');
  }

  // ---------- 渲染：屏 4 账单 ----------
  function flowItem(b) {
    const color = catColor[b.category] || (b.type === 'income' ? '#3D8A5A' : '#6D6C6A');
    const icon = b.type === 'income' ? catIcon('收入', color, 20) : catIcon(b.category, color, 20);
    const sign = b.type === 'income' ? '+' : '-';
    const amtCls = b.type === 'income' ? 'flow-in' : 'flow-out';
    return `<div class="flow-item" data-id="${esc(b.id)}">
      <div class="flow-del" data-del="${esc(b.id)}">删除</div>
      <div class="flow-content">
        <div class="flow-icon" style="background:${color}1A">${icon}</div>
        <div class="flow-main"><div class="flow-title">${esc(b.note)}</div><div class="flow-meta">${esc(b.category)} · ${esc(b.time)}</div></div>
        <div class="flow-amt ${amtCls}">${sign}${fmtMoney(b.amount)}</div>
      </div>
    </div>`;
  }

  // 按月份聚合账单：支出/收入/结余 + 支出分类
  function aggregateBills(list) {
    let expense = 0, income = 0;
    const m = {};
    list.forEach((b) => {
      const name = b.category || '其他';
      if (!m[name]) m[name] = { name, color: catColor[name] || '#6D6C6A', exp: 0, inc: 0 };
      if (b.type === 'income') { income += b.amount; m[name].inc += b.amount; }
      else { expense += b.amount; m[name].exp += b.amount; }
    });
    const ecats = Object.values(m).filter((c) => c.exp > 0).sort((a, b) => b.exp - a.exp);
    const tot = ecats.reduce((s, c) => s + c.exp, 0) || 1;
    ecats.forEach((c) => (c.pct = Math.round((c.exp / tot) * 100)));
    return { expense, income, balance: income - expense, ecats };
  }
  function reportMonthKey(r) {
    const mm = (r.month || '').match(/(\d{4})\D+(\d{1,2})/);
    return mm ? `${mm[1]}-${mm[2].padStart(2, '0')}` : '';
  }
  function buildInsight(agg) {
    const top = agg.ecats[0];
    let s = `本月共支出 ¥${fmtMoney(agg.expense)}，收入 ¥${fmtMoney(agg.income)}，结余 ¥${fmtMoney(agg.balance)}。`;
    if (top) s += `其中「${top.name}」支出占比最高，达 ${top.pct}%。`;
    return s;
  }
  function currentWeekRange() {
    const base = new Date(TODAY + 'T00:00:00');
    const dow = base.getDay() || 7; // 周一=1..周日=7
    const mon = new Date(base); mon.setDate(base.getDate() - (dow - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { mon: iso(mon), sun: iso(sun) };
  }
  function computeWeekReport(r) {
    let sd, ed;
    if (r.sd && r.ed) { sd = r.sd; ed = r.ed; }
    else {
      const m = String(r.range || '').match(/(\d{1,2})\.(\d{1,2})\s*[–\-]\s*(\d{1,2})\.(\d{1,2})/);
      if (!m) return r;
      const y = String(new Date().getFullYear());
      sd = `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
      ed = `${y}-${String(m[3]).padStart(2, '0')}-${String(m[4]).padStart(2, '0')}`;
    }
    const list = DB.data.bills.filter((b) => b.date >= sd && b.date <= ed);
    const agg = aggregateBills(list);
    const wdNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const daily = wdNames.map((wd, i) => {
      const d = new Date(sd + 'T00:00:00'); d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const val = list.filter((b) => b.date === ds && b.type !== 'income').reduce((s, b) => s + b.amount, 0);
      return { day: wd, val };
    });
    return Object.assign({}, r, {
      expense: agg.expense, income: agg.income, balance: agg.balance,
      daily,
      cats: agg.ecats.map((c) => ({ name: c.name, color: c.color, amount: c.exp, pct: c.pct })),
      insight: list.length ? buildInsight(agg) : '本周暂无账单记录。'
    });
  }
  function computeMonthReport(r) {
    const key = r.monthKey || reportMonthKey(r);
    const list = DB.billsByMonth(key);
    const agg = aggregateBills(list);
    const wk = [0, 0, 0, 0];
    list.forEach((b) => {
      if (b.type !== 'income') { const d = parseInt(b.date.slice(8), 10); const wi = Math.min(3, Math.floor((d - 1) / 7)); wk[wi] += b.amount; }
    });
    const weeks = ['第1周', '第2周', '第3周', '第4周'].map((label, i) => ({ label, val: wk[i] }));
    return Object.assign({}, r, {
      expense: agg.expense, income: agg.income, balance: agg.balance,
      weeks,
      cats: agg.ecats.map((c) => ({ name: c.name, color: c.color, amount: c.exp, pct: c.pct })),
      insight: list.length ? buildInsight(agg) : '本月暂无账单记录。'
    });
  }

  let curMonth = (DB.monthKeys().includes(TODAY.slice(0, 7)) ? TODAY.slice(0, 7) : DB.monthKeys()[0]) || TODAY.slice(0, 7) || '2026-07';
  function renderS4Bills() {
    setText('#s4-month-label', monthLabel(curMonth));
    const bills = DB.billsByMonth(curMonth);
    const exp = bills.filter((b) => b.type !== 'income').reduce((s, b) => s + b.amount, 0);
    const inc = bills.filter((b) => b.type === 'income').reduce((s, b) => s + b.amount, 0);
    setText('#m-exp', '¥ ' + fmtMoney(exp));
    setText('#m-inc', '¥ ' + fmtMoney(inc));
    setText('#m-bal', '¥ ' + fmtMoney(inc - exp));

    const order = [...new Set(bills.map((b) => b.date))].sort().reverse();
    let html = '';
    if (!order.length) {
      html = '<div class="s4-empty">本月还没有记账，点右下角 + 记一笔吧</div>';
    } else {
      order.forEach((date) => {
        const list = bills.filter((b) => b.date === date);
        const e = list.filter((b) => b.type !== 'income').reduce((s, b) => s + b.amount, 0);
        const i = list.filter((b) => b.type === 'income').reduce((s, b) => s + b.amount, 0);
        html += `<div class="day-row"><span class="day-name ${date === TODAY ? 'day-name-today' : ''}">${esc(monthShort(date))} ${esc(weekdayName(date))}</span><span class="day-stat">支出 -${fmtMoney(e)}</span>${i > 0 ? `<span class="day-stat-faint">收入 +${fmtMoney(i)}</span>` : ''}</div>`;
        html += `<div class="flow-list">${list.map(flowItem).join('')}</div>`;
      });
    }
    $('#s4-bills').innerHTML = html;
  }
  function renderS4WeeklyArchive() {
    const list = DB.data.weeklyBillReports.filter((r) => r.id !== 'wb30');
    $('#s4-weekly-archive').innerHTML = list
      .map(
        (r) => `<button class="arc-item" data-wb="${r.id}">
          <div class="arc-main"><div class="arc-week">${r.week} · ${r.range}</div><div class="arc-meta">支出 ¥${fmtMoney(r.expense)} · 收入 ¥${fmtMoney(r.income)}</div></div>
          <span class="arc-pill">${checkSvg}已留存</span>${arrowSvg('#3D8A5A')}</button>`
      )
      .join('');
  }
  function renderS4MonthlyArchive() {
    const list = DB.data.monthlyBillReports.filter((r) => r.id !== 'mb7');
    $('#s4-monthly-archive').innerHTML = list
      .map(
        (r) => `<button class="arc-item" data-month="${r.id}">
          <div class="arc-main"><div class="arc-week">${r.month} · 月度收支分析</div><div class="arc-meta">支出 ¥${fmtMoney(r.expense)} · 收入 ¥${fmtMoney(r.income)} · 结余 +¥${fmtMoney(r.balance)}</div></div>
          <span class="arc-pill">${checkSvg}已留存</span>${arrowSvg('#3D8A5A')}</button>`
      )
      .join('');
  }

  // ---------- 渲染：屏 6 / 屏 7 报告 ----------
  function billHero(r, mode) {
    if (mode === 'week') {
      return `<div class="s6-hero">
        <div class="s6-hero-week">${r.week} ${fullWeekRange(r.range)}</div>
        <div class="s6-hero-row">
          <div class="s6-hero-col"><div class="s6-hero-label">支出</div><div class="s6-hero-num">¥ ${fmtMoney(r.expense)}</div></div>
          <div class="s6-hero-col"><div class="s6-hero-label">收入</div><div class="s6-hero-num">¥ ${fmtMoney(r.income)}</div></div>
          <div class="s6-hero-col"><div class="s6-hero-label">结余</div><div class="s6-hero-num">+ ¥ ${fmtMoney(r.balance)}</div></div>
        </div>
        <div class="s6-hero-badge">${clockWhite} 每周一 9:00 自动生成</div></div>`;
    }
    return `<div class="s6-hero">
      <div class="s6-hero-week">${r.month}</div>
      <div class="s6-hero-row">
        <div class="s6-hero-col"><div class="s6-hero-label">月支出</div><div class="s6-hero-num">¥ ${fmtMoney(r.expense)}</div></div>
        <div class="s6-hero-col"><div class="s6-hero-label">月收入</div><div class="s6-hero-num">¥ ${fmtMoney(r.income)}</div></div>
        <div class="s6-hero-col"><div class="s6-hero-label">月结余</div><div class="s6-hero-num">+ ¥ ${fmtMoney(r.balance)}</div></div>
      </div>
      <div class="s6-hero-badge">${clockWhite} 每月 1 日 9:00 自动生成</div></div>`;
  }
  function billChart(items, mode) {
    const max = Math.max(...items.map((d) => d.val || d.val === 0 ? d.val : 0));
    const label = mode === 'week' ? '日均 ¥' + Math.round(max / 7) : '月日均 ¥' + Math.round(max / 4);
    const title = mode === 'week' ? '每日支出' : '各周支出';
    const bars = items
      .map((d) => {
        const h = max > 0 ? Math.max(6, Math.round((d.val / max) * 90)) : 6;
        return `<div class="s6-bar s6-bar-h"><span class="s6-bar-val">${d.val}</span><div class="s6-bar-fill" style="height:${h}%"></div><span class="s6-bar-day">${esc(d.day || d.label)}</span></div>`;
      })
      .join('');
    const cols = mode === 'week' ? 'repeat(7, 1fr)' : 'repeat(4, 1fr)';
    return `<div class="card s6-card">
      <div class="s6-card-head"><h4 class="s6-card-title">${title}</h4><span class="s6-card-stat">${label}</span></div>
      <div class="s6-chart" style="grid-template-columns:${cols}">${bars}</div></div>`;
  }
  function billCats(cats) {
    return `<div class="card s6-card"><h4 class="s6-card-title">支出分类</h4><div class="s6-cat-list">${cats
      .map(
        (c) => `<div class="s6-cat-item">
          <div class="s6-cat-icon" style="background:${c.color}26">${catIcon(c.name, c.color, 16)}</div>
          <div class="s6-cat-info"><div class="s6-cat-top"><span class="s6-cat-name">${esc(c.name)}</span></div><div class="s6-cat-bar"><div class="s6-cat-fill" style="width:${c.pct}%; background:${c.color}"></div></div></div>
          <div class="s6-cat-data"><span class="s6-cat-amt">¥ ${fmtMoney(c.amount)}</span><span class="s6-cat-pct">${c.pct}%</span></div></div>`
      )
      .join('')}</div></div>`;
  }
  function renderS6() {
    const base = DB.data.weeklyBillReports.find((x) => x.id === state.weeklyBill) || DB.data.weeklyBillReports[0];
    const r = computeWeekReport(base);
    setText('#s6-week-label', r.week + ' · 周账单');
    $('#s6-report').innerHTML =
      billHero(r, 'week') + billChart(r.daily.map((d) => ({ day: d.day, val: d.val })), 'week') + billCats(r.cats) +
      `<div class="s6-insight"><div class="insight-title">${starSvg}本周洞察</div><div class="insight-text">${esc(r.insight)}</div></div>`;
  }
  function renderS7() {
    const base = DB.data.monthlyBillReports.find((x) => x.id === state.monthly) || DB.data.monthlyBillReports[0];
    const r = computeMonthReport(base);
    setText('#s7-month-label', r.month + ' · 月度收支');
    $('#s7-report').innerHTML =
      billHero(r, 'month') + billChart(r.weeks.map((w) => ({ label: w.label, val: w.val })), 'month') + billCats(r.cats) +
      `<div class="s6-insight"><div class="insight-title">${starSvg}本月洞察</div><div class="insight-text">${esc(r.insight)}</div></div>`;
  }

  function renderAll() {
    renderS1Notes(); renderS1MonthLabel(); renderS1Archive(); renderS3();
    renderS4Bills(); renderS4WeeklyArchive(); renderS4MonthlyArchive();
    renderS6(); renderS7();
  }

  // ---------- 导航 ----------
  const screens = $$('.screen');
  const navBtns = $$('.nav-btn');
  function showScreen(id) {
    screens.forEach((s) => s.classList.toggle('active', s.id === id));
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.target === id));
    const active = document.getElementById(id);
    if (active) {
      const sc = active.querySelector('.scroll-area');
      if (sc) sc.scrollTop = 0;
    }
    if (id === 'screen-5') resetKeypad();
    if (id === 'screen-2') initS2();
  }

  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-nav]');
    if (target) { e.preventDefault(); showScreen(target.dataset.nav); return; }
    const wn = e.target.closest('[data-week]');
    if (wn) { state.weeklyNote = wn.dataset.week; renderS3(); showScreen('screen-3'); return; }
    const mb = e.target.closest('[data-month]');
    if (mb) { state.monthly = mb.dataset.month; renderS7(); showScreen('screen-7'); return; }
    const wb = e.target.closest('[data-wb]');
    if (wb) { state.weeklyBill = wb.dataset.wb; renderS6(); showScreen('screen-6'); return; }
  });
  navBtns.forEach((btn) => btn.addEventListener('click', () => showScreen(btn.dataset.target)));
  const order = [...screens].map((s) => s.id);
  document.addEventListener('keydown', (e) => {
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const idx = order.indexOf(active.id);
    if (e.key === 'ArrowRight' && idx < order.length - 1) showScreen(order[idx + 1]);
    if (e.key === 'ArrowLeft' && idx > 0) showScreen(order[idx - 1]);
  });

  // ---------- 屏 2：富媒体记录编辑器 ----------
  const s2 = {
    editor: $('#s2-editor'),
    tray: $('#s2-tray'),
    time: $('#s2-time'),
    date: $('#s2-date'),
    place: $('#s2-place'),
    locHint: $('#s2-loc-hint'),
    media: []
  };
  let s2Place = '位置待授权';
  // 真实定位缓存（基于 navigator.geolocation + BigDataCloud 免费反向地理编码），全 app 共用
  let userPlaceCache = null;
  const GEO_KEY = 'suisui_geo_v1';
  function readGeoCache() {
    try {
      const s = localStorage.getItem(GEO_KEY);
      if (!s) return null;
      const o = JSON.parse(s);
      // 缓存 6 小时过期
      if (Date.now() - (o.ts || 0) > 6 * 3600 * 1000) return null;
      return o;
    } catch (e) { return null; }
  }
  function writeGeoCache(o) { try { localStorage.setItem(GEO_KEY, JSON.stringify(o)); } catch (e) {} }
  async function fetchCityByCoord(lat, lng) {
    // BigDataCloud 免费客户端反向地理编码（CORS 允许，免 key）
    try {
      const u = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`;
      const r = await fetch(u, { method: 'GET' });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      const city = j.city || j.locality || j.principalSubdivision || j.countryName || '';
      return city ? String(city).replace(/(市|省|自治区|特别行政区)$/, '') : '';
    } catch (e) { return ''; }
  }
  function requestUserPlace(force) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      const cached = readGeoCache();
      if (cached && !force) { userPlaceCache = cached.city; resolve(cached.city); return; }
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        let city = await fetchCityByCoord(lat, lng);
        if (!city) city = '当前位置';
        const o = { city, lat, lng, ts: Date.now() };
        writeGeoCache(o);
        userPlaceCache = city;
        resolve(city);
      }, (err) => {
        // 用户拒绝或失败：保留旧缓存（若有）以避免反复弹窗
        if (cached) { userPlaceCache = cached.city; resolve(cached.city); }
        else { resolve(null); }
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    });
  }

  function s2Preview(m) { return m._url || m.src || ''; }
  function renderTray() {
    s2.tray.innerHTML = s2.media
      .map((m, i) => `<div class="tray-item" data-i="${i}">
          ${m.kind === 'video' ? `<video src="${esc(s2Preview(m))}" playsinline preload="metadata"></video>` : `<img src="${esc(s2Preview(m))}" alt="">`}
          <div class="tray-tools">
            ${m.kind === 'image' ? `<button class="tray-act tray-crop" data-crop="${i}" aria-label="裁剪">裁剪</button>` : ''}
            ${m.kind === 'video' ? `<button class="tray-act tray-clip" data-clip="${i}" aria-label="剪辑">剪辑</button>` : ''}
            <button class="tray-x" data-rm="${i}" aria-label="移除">×</button>
          </div>
        </div>`)
      .join('');
  }
  s2.tray.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const i = +rm.dataset.rm;
      const m = s2.media[i];
      if (m && m.mediaId) SuiDB.deleteMedia(m.mediaId);
      s2.media.splice(i, 1);
      renderTray();
      return;
    }
    const view = e.target.closest('[data-view]');
    if (view) { openLightbox(s2.media[+view.dataset.view]); return; }
    const crop = e.target.closest('[data-crop]');
    if (crop) { openNoteCrop(s2.media[+crop.dataset.crop]); return; }
    const clip = e.target.closest('[data-clip]');
    if (clip) { openClip(s2.media[+clip.dataset.clip]); return; }
    const item = e.target.closest('.tray-item');
    if (item) openLightbox(s2.media[+item.dataset.i]);
  });

  function addComposeMedia(desc) { s2.media.push(desc); renderTray(); }

  /* ============ T4 放大查看（lightbox） ============ */
  function openLightbox(m) {
    if (!m) return;
    const stage = $('#lbStage');
    stage.innerHTML = '';
    const kind = m.kind || 'image';
    const show = (u) => {
      if (kind === 'video') {
        const v = document.createElement('video'); v.src = u; v.controls = true; v.playsInline = true; stage.appendChild(v);
      } else {
        const img = document.createElement('img'); img.src = u; stage.appendChild(img);
      }
    };
    const url = s2Preview(m);
    if (url) show(url);
    else if (m.mediaId) SuiDB.mediaURL(m.mediaId).then((u) => { if (u) show(u); });
    $('#lightbox').hidden = false;
  }
  $('#lbClose').addEventListener('click', () => { $('#lightbox').hidden = true; $('#lbStage').innerHTML = ''; });
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') { $('#lightbox').hidden = true; $('#lbStage').innerHTML = ''; } });

  /* ============ T5 照片裁剪（手记内） ============ */
  let noteCropState = { scale: 1, tx: 0, ty: 0 }, cropBaseScale = 1, cropImgEl = null, cropTargetIndex = -1;
  const cropVP = $('#cropViewport');
  function openNoteCrop(m) {
    if (!m || m.kind !== 'image') return;
    cropTargetIndex = s2.media.indexOf(m);
    const start = (url) => {
      noteCropState = { scale: 1, tx: 0, ty: 0 };
      cropImgEl = $('#cropImg');
      cropImgEl.onload = () => {
        const vp = cropVP.getBoundingClientRect();
        const iw = cropImgEl.naturalWidth, ih = cropImgEl.naturalHeight;
        cropBaseScale = Math.min(vp.width / iw, vp.height / ih) || 1;
        cropImgEl.style.width = Math.round(iw * cropBaseScale) + 'px';
        cropImgEl.style.height = Math.round(ih * cropBaseScale) + 'px';
        applyCropTransform();
      };
      cropImgEl.src = url;
      $('#cropZoom').value = 1;
      $('#cropModal').hidden = false;
    };
    const url = s2Preview(m);
    if (url) start(url);
    else if (m.mediaId) SuiDB.mediaURL(m.mediaId).then((u) => { if (u) start(u); });
  }
  function applyCropTransform() {
    if (!cropImgEl) return;
    cropImgEl.style.transform = `translate(${noteCropState.tx}px, ${noteCropState.ty}px) scale(${noteCropState.scale})`;
  }
  function closeNoteCrop() { $('#cropModal').hidden = true; if (cropImgEl) cropImgEl.removeAttribute('src'); cropTargetIndex = -1; }
  let noteCropDrag = false, cropLX = 0, cropLY = 0;
  cropVP.addEventListener('pointerdown', (e) => { noteCropDrag = true; cropLX = e.clientX; cropLY = e.clientY; try { cropVP.setPointerCapture(e.pointerId); } catch (x) {} });
  cropVP.addEventListener('pointermove', (e) => {
    if (!noteCropDrag) return;
    noteCropState.tx += e.clientX - cropLX; noteCropState.ty += e.clientY - cropLY;
    cropLX = e.clientX; cropLY = e.clientY; applyCropTransform();
  });
  cropVP.addEventListener('pointerup', () => { noteCropDrag = false; });
  cropVP.addEventListener('pointercancel', () => { noteCropDrag = false; });
  $('#cropZoom').addEventListener('input', (e) => { noteCropState.scale = parseFloat(e.target.value) || 1; applyCropTransform(); });
  $('#cropCancel').addEventListener('click', closeNoteCrop);
  $('#cropReset').addEventListener('click', () => { noteCropState = { scale: 1, tx: 0, ty: 0 }; $('#cropZoom').value = 1; applyCropTransform(); });
  $('#cropConfirm').addEventListener('click', () => {
    if (!cropImgEl || !cropImgEl.complete || !cropImgEl.naturalWidth) { toast('图片未就绪'); return; }
    const vp = cropVP.getBoundingClientRect();
    const iw = cropImgEl.naturalWidth, ih = cropImgEl.naturalHeight;
    const dispW = iw * cropBaseScale * noteCropState.scale, dispH = ih * cropBaseScale * noteCropState.scale;
    const imgLeft = (vp.width - dispW) / 2 + noteCropState.tx, imgTop = (vp.height - dispH) / 2 + noteCropState.ty;
    const k = cropBaseScale * noteCropState.scale;
    const sx0 = (0 - imgLeft) / k, sy0 = (0 - imgTop) / k;
    const sx1 = (vp.width - imgLeft) / k, sy1 = (vp.height - imgTop) / k;
    const cw = Math.max(1, Math.round(sx1 - sx0)), ch = Math.max(1, Math.round(sy1 - sy0));
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cropImgEl, sx0, sy0, cw, ch, 0, 0, cw, ch);
    canvas.toBlob((blob) => {
      if (!blob) { toast('裁剪失败'); return; }
      const url = URL.createObjectURL(blob);
      SuiDB.storeMedia(blob).then((d) => {
        d.kind = 'image'; d._url = url;
        if (cropTargetIndex >= 0 && cropTargetIndex < s2.media.length) {
          const old = s2.media[cropTargetIndex];
          if (old && old.mediaId) SuiDB.deleteMedia(old.mediaId);
          s2.media[cropTargetIndex] = d; renderTray();
        }
        closeNoteCrop(); toast('已裁剪');
      });
    }, 'image/jpeg', 0.9);
  });
  /* CLIP_NEXT */

  /* ============ T6 视频剪辑 ============ */
  let clipTargetIndex = -1;
  const clipVideo = $('#clipVideo');
  function openClip(m) {
    if (!m || m.kind !== 'video') return;
    clipTargetIndex = s2.media.indexOf(m);
    const start = (url) => {
      clipVideo.src = url; clipVideo.muted = false;
      clipVideo.onloadedmetadata = () => {
        $('#clipStart').value = 0; $('#clipEnd').value = 1000;
        updateClipInfo();
        $('#clipModal').hidden = false;
      };
    };
    const url = s2Preview(m);
    if (url) start(url);
    else if (m.mediaId) SuiDB.mediaURL(m.mediaId).then((u) => { if (u) start(u); });
  }
  function clipBounds() {
    const d = clipVideo.duration || 0;
    const s = (+$('#clipStart').value) / 1000 * d;
    const e = (+$('#clipEnd').value) / 1000 * d;
    return { d, s: Math.min(s, e), e: Math.max(s, e) };
  }
  function updateClipInfo() {
    const { s, e } = clipBounds();
    $('#clipInfo').textContent = `起 ${s.toFixed(1)}s · 止 ${e.toFixed(1)}s · 时长 ${(e - s).toFixed(1)}s`;
  }
  $('#clipStart').addEventListener('input', updateClipInfo);
  $('#clipEnd').addEventListener('input', updateClipInfo);
  $('#clipCancel').addEventListener('click', () => { $('#clipModal').hidden = true; clipVideo.removeAttribute('src'); clipTargetIndex = -1; });
  $('#clipReset').addEventListener('click', () => { $('#clipStart').value = 0; $('#clipEnd').value = 1000; updateClipInfo(); });
  $('#clipConfirm').addEventListener('click', async () => {
    if (!clipVideo.videoWidth) { toast('视频未就绪'); return; }
    const { s, e } = clipBounds();
    if (e - s < 0.3) { toast('片段太短'); return; }
    toast('正在剪辑视频…');
    const sv = document.createElement('video');
    sv.src = clipVideo.currentSrc || clipVideo.src;
    sv.muted = false; sv.playsInline = true; sv.crossOrigin = 'anonymous';
    await new Promise((res) => { sv.onloadeddata = res; sv.onerror = res; });
    const canvas = document.createElement('canvas');
    canvas.width = sv.videoWidth || 640; canvas.height = sv.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const mime = pickRecMime();
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime }); } catch (err) { rec = new MediaRecorder(stream); }
    const chunks = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const srcNode = ac.createMediaElementSource(sv);
      const dest = ac.createMediaStreamDestination();
      srcNode.connect(dest);
      const at = dest.stream.getAudioTracks()[0];
      if (at) stream.addTrack(at);
    } catch (err) { /* 无音频则静音合成 */ }
    rec.start();
    try { sv.currentTime = s; await sv.play(); } catch (err) {}
    await new Promise((resolve) => {
      function tick() {
        if (sv.currentTime >= e || sv.ended) { try { sv.pause(); } catch (x) {} try { rec.stop(); } catch (x) {} resolve(); return; }
        try { ctx.drawImage(sv, 0, 0, canvas.width, canvas.height); } catch (x) {}
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    await done;
    const blob = new Blob(chunks, { type: mime });
    if (!blob || !blob.size) { toast('剪辑失败，请重试'); $('#clipModal').hidden = true; return; }
    const url = URL.createObjectURL(blob);
    SuiDB.storeMedia(blob).then((d) => {
      d.kind = 'video'; d._url = url; d.dur = fmtSec(e - s);
      if (clipTargetIndex >= 0 && clipTargetIndex < s2.media.length) {
        const old = s2.media[clipTargetIndex];
        if (old && old.mediaId) SuiDB.deleteMedia(old.mediaId);
        s2.media[clipTargetIndex] = d; renderTray();
      }
      $('#clipModal').hidden = true; clipVideo.removeAttribute('src'); clipTargetIndex = -1;
      toast('已剪辑');
    });
  });

  // 图片：拍照（系统相机内可切换前后置）或相册选择（压缩后存 IndexedDB）
  const capPhotoBack = $('#capPhotoBack'), capPhotoAlbum = $('#capPhotoAlbum');
  function addPhotoFile(f) {
    if (!f) return;
    compressImageFile(f).then((blob) => {
      const url = URL.createObjectURL(blob);
      SuiDB.storeMedia(blob).then((d) => { d.kind = 'image'; d._url = url; addComposeMedia(d); });
    });
  }
  [capPhotoBack, capPhotoAlbum].forEach((inp) => {
    if (inp) inp.addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; addPhotoFile(f); });
  });

  // 拍摄 / 上传来源选择弹层
  // 注意：拍照/相册类选项改为 <label for=...> 原生触发 <input type=file>，
  // 避免在已安装 PWA / TWA 中「JS 调用 input.click()」被部分 WebView 拦截、
  // 导致点击后文件选择器打不开（这正是「无法拍照/上传」的根因）。
  const captureSheet = $('#captureSheet'), capOpts = $('#capOpts'), capTitle = $('#capTitle');
  function openCaptureSheet(kind) {
    const opts = kind === 'video'
      ? [
          { t: '拍摄（后置摄像头）', cap: 'video-back' },
          { t: '拍摄（前置摄像头）', cap: 'video-front' },
          { t: '从相册选择视频', file: 'capVideoAlbum' }
        ]
      : [
          { t: '拍照', file: 'capPhotoBack' },
          { t: '从相册选择照片', file: 'capPhotoAlbum' }
        ];
    capTitle.textContent = kind === 'video' ? '添加视频' : '添加照片';
    capOpts.innerHTML = opts.map((o) =>
      o.file
        ? `<button type="button" class="cap-opt" data-file="${o.file}">${o.t}</button>`
        : `<button type="button" class="cap-opt" data-cap="${o.cap}">${o.t}</button>`
    ).join('');
    captureSheet.hidden = false;
  }
  function closeCaptureSheet() { if (captureSheet) captureSheet.hidden = true; }
  if (captureSheet) {
    captureSheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-cap-close]')) { closeCaptureSheet(); return; }
      const opt = e.target.closest('.cap-opt'); if (!opt) return;
      const fileId = opt.dataset.file;
      const cap = opt.dataset.cap;
      closeCaptureSheet();
      // 文件类选项：在真实用户手势中调用 input.click()，比 <label for> 在 Android 上更稳定可靠
      if (fileId) { const el = document.getElementById(fileId); if (el) el.click(); return; }
      if (cap === 'video-back') { recFacing = 'environment'; openRec(); }
      else if (cap === 'video-front') { recFacing = 'user'; openRec(); }
    });
  }

  // 视频：拍摄（可随时点「停止拍摄」结束，最长 60 秒）或相册选择
  const recModal = $('#recModal'), recPreview = $('#recPreview'), recTimerEl = $('#recTimer');
  const recShoot = $('#recShoot'), recUse = $('#recUse'), recRetake = $('#recRetake');
  const recStopBtn = $('#recStop');
  const recAlbum = $('#recAlbum'), recClose = $('#recClose');
  let recFacing = 'environment';
  let recOrient = 'portrait';
  const recOrientBtn = $('#recOrient');
  let recStream = null, mediaRec = null, recChunks = [], recTimerInt = null, recStartTs = 0, recBlob = null, recUrl = null, recDur = 0;
  // 横屏/竖屏：取流约束按方向设比例；预览容器也按方向切换比例，均不裁切
  function recVideoConstraints() {
    const portrait = recOrient !== 'landscape';
    return {
      video: {
        facingMode: recFacing,
        width: portrait ? { ideal: 720 } : { ideal: 1280 },
        height: portrait ? { ideal: 1280 } : { ideal: 720 }
      },
      audio: { echoCancellation: true, noiseSuppression: true }
    };
  }
  function applyRecOrient() {
    if (!recPreview) return;
    if (recOrient === 'landscape') { recPreview.classList.add('land'); if (recOrientBtn) recOrientBtn.textContent = '▭ 横屏'; }
    else { recPreview.classList.remove('land'); if (recOrientBtn) recOrientBtn.textContent = '▯ 竖屏'; }
  }
  const REC_MAX = 60;
  const REC_MIN_MS = 700; // 低于此时长的点击视为误触，不生成空视频

  function fmtSec(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  const REC_MAX_LABEL = fmtSec(REC_MAX);

  // 预览元素统一复位：录制取景时必须静音，否则会「边拍边外放正在拍的声音」（回声/啸叫）
  function resetPreviewForLive() {
    recPreview.removeAttribute('controls');
    recPreview.loop = false;
    recPreview.muted = true;
    recPreview.defaultMuted = true;
    recPreview.volume = 0;
    recPreview.setAttribute('muted', '');
    recPreview.playsInline = true;
  }
  function setRecUI(mode) {
    // mode: 'idle' | 'recording' | 'review'
    recShoot.hidden = mode !== 'idle';
    recShoot.disabled = mode !== 'idle';
    recAlbum.hidden = mode === 'recording';
    if (recStopBtn) { recStopBtn.hidden = mode !== 'recording'; recStopBtn.disabled = mode !== 'recording'; }
    recUse.hidden = mode !== 'review';
    recRetake.hidden = mode !== 'review';
    recTimerEl.classList.toggle('recording', mode === 'recording');
  }

  function openRec() {
    recModal.hidden = false;
    resetPreviewForLive();
    setRecUI('idle');
    applyRecOrient();
    recTimerEl.textContent = '0:00 / ' + REC_MAX_LABEL;
  }
  function closeRec() {
    recModal.hidden = true;
    if (mediaRec && mediaRec.state !== 'inactive') { try { mediaRec.onstop = null; mediaRec.stop(); } catch (e) {} }
    clearTimeout(recTimerInt);
    stopStream();
    if (recUrl) { URL.revokeObjectURL(recUrl); recUrl = null; }
    recBlob = null; recChunks = []; recPreview.removeAttribute('src'); recPreview.srcObject = null;
    resetPreviewForLive();
    setRecUI('idle');
  }
  function stopStream() { if (recStream) { recStream.getTracks().forEach((t) => t.stop()); recStream = null; } }
  function tickRec() {
    const el = (Date.now() - recStartTs) / 1000;
    recTimerEl.textContent = fmtSec(Math.min(el, REC_MAX)) + ' / ' + REC_MAX_LABEL;
    if (el >= REC_MAX) { stopRec(); return; }
    recTimerInt = setTimeout(tickRec, 200);
  }
  function stopRec() {
    clearTimeout(recTimerInt);
    recDur = Math.max(1, Math.round((Date.now() - recStartTs) / 1000));
    if (recStopBtn) recStopBtn.disabled = true;
    recTimerEl.classList.remove('recording');
    if (mediaRec && mediaRec.state !== 'inactive') { try { mediaRec.stop(); } catch (e) {} }
    else { stopStream(); }
  }
  function onRecStop() {
    stopStream();
    const type = (mediaRec && mediaRec.mimeType) || (recChunks[0] && recChunks[0].type) || 'video/mp4';
    recBlob = new Blob(recChunks, { type });
    if (!recBlob.size) {
      toast('没有录到画面，请再试一次');
      recBlob = null; recChunks = [];
      recPreview.srcObject = null; recPreview.removeAttribute('src');
      resetPreviewForLive(); setRecUI('idle');
      recTimerEl.textContent = '0:00 / ' + REC_MAX_LABEL;
      return;
    }
    recUrl = URL.createObjectURL(recBlob);
    // 回看阶段才解除静音（此时是播放已录好的片段，不会造成实时回声）
    recPreview.srcObject = null;
    recPreview.src = recUrl;
    recPreview.controls = true;
    recPreview.muted = false;
    recPreview.removeAttribute('muted');
    recPreview.volume = 1;
    try { recPreview.play(); } catch (e) {}
    const probe = document.createElement('video'); probe.src = recUrl;
    probe.onloadedmetadata = () => {
      const d = probe.duration;
      if (isFinite(d) && d > 0) recDur = Math.min(REC_MAX, Math.max(1, Math.round(d)));
    };
    recTimerEl.textContent = '已录制 ' + fmtSec(recDur);
    setRecUI('review');
  }
  function openRecAlbum() { const el = $('#capVideoAlbum'); if (el) el.click(); }

  function pickRecMime() {
    const cands = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
    return '';
  }

  if (recShoot) recShoot.addEventListener('click', async () => {
    recShoot.disabled = true;
    try {
      recStream = await navigator.mediaDevices.getUserMedia(recVideoConstraints());
    } catch (err) {
      recShoot.disabled = false;
      toast('无法访问相机，已为你打开相册选择'); openRecAlbum(); return;
    }
    // 关键：取景阶段强制静音，避免边拍边外放（回声/自我监听）
    resetPreviewForLive();
    recPreview.srcObject = recStream;
    try { await recPreview.play(); } catch (e) {}
    recChunks = [];
    const mime = pickRecMime();
    try {
      mediaRec = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream);
    } catch (e) {
      mediaRec = new MediaRecorder(recStream);
    }
    mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = onRecStop;
    mediaRec.start(200); // 分片输出，随时停止都能拿到完整数据
    recStartTs = Date.now();
    recDur = 0;
    setRecUI('recording');
    tickRec();
  });
  if (recStopBtn) recStopBtn.addEventListener('click', () => {
    const elapsed = Date.now() - recStartTs;
    if (elapsed < REC_MIN_MS) { toast('再拍一会儿吧'); return; }
    stopRec();
  });
  if (recUse) recUse.addEventListener('click', () => {
    if (!recBlob) return;
    const dur = Math.min(REC_MAX, Math.max(1, recDur || 1));
    SuiDB.storeMedia(recBlob).then((d) => {
      d.kind = 'video'; d._url = recUrl; d.dur = fmtSec(dur);
      addComposeMedia(d); toast('视频已加入记录');
    });
    // 该 url 已交给 compose 预览使用，这里不 revoke
    recModal.hidden = true;
    if (mediaRec && mediaRec.state !== 'inactive') { try { mediaRec.onstop = null; mediaRec.stop(); } catch (e) {} }
    clearTimeout(recTimerInt); stopStream();
    recUrl = null; recBlob = null; recChunks = [];
    recPreview.removeAttribute('src'); recPreview.srcObject = null;
    resetPreviewForLive(); setRecUI('idle');
  });
  if (recRetake) recRetake.addEventListener('click', () => {
    if (recUrl) { URL.revokeObjectURL(recUrl); recUrl = null; }
    recBlob = null; recChunks = []; recDur = 0;
    recPreview.pause();
    recPreview.removeAttribute('src');
    recPreview.srcObject = null;
    recPreview.load();
    resetPreviewForLive(); // 复位静音，否则第二次拍摄会边拍边响
    setRecUI('idle');
    recTimerEl.textContent = '0:00 / ' + REC_MAX_LABEL;
  });
  if (recAlbum) recAlbum.addEventListener('click', openRecAlbum);
  if (recClose) recClose.addEventListener('click', closeRec);
  if (recOrientBtn) recOrientBtn.addEventListener('click', () => {
    recOrient = recOrient === 'portrait' ? 'landscape' : 'portrait';
    applyRecOrient();
  });
  const capVideoAlbum = $('#capVideoAlbum');
  if (capVideoAlbum) capVideoAlbum.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    SuiDB.storeMedia(f).then((d) => { d.kind = 'video'; d._url = url; d.dur = ''; addComposeMedia(d); });
    closeRec();
  });

  function compressImageFile(file) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            const r = Math.min(max / w, max / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.82);
        };
        img.onerror = () => resolve(file);
        img.src = fr.result;
      };
      fr.onerror = () => resolve(file);
      fr.readAsDataURL(file);
    });
  }

  // 定位：获取地点授权（Geolocation API）+ 缓存
  function requestLocation() {
    const locBtn = $('#tool-loc');
    if (!navigator.geolocation) { setPlace('此设备不支持定位'); return; }
    if (locBtn) locBtn.classList.add('tool-locating');
    s2.locHint.textContent = '正在获取定位…';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let name = `${lat.toFixed(3)}°N ${lng.toFixed(3)}°E`;
        try {
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`);
          const j = await res.json();
          const subdiv = j.principalSubdivision || '';
          const city = j.city || j.locality || '';
          if (subdiv && city && city !== subdiv) name = `${subdiv}${city}`;
          else if (city) name = city;
          else if (subdiv) name = subdiv;
          else if (j.locality) name = j.locality;
        } catch (e) { /* 网络异常时回退坐标 */ }
        setPlace(name);
        s2.locHint.textContent = '地点已记录，结束时会自动写入';
        // 写入本地缓存供下次自动使用
        writeGeoCache({ city: name, lat, lng, ts: Date.now() });
        userPlaceCache = name;
        if (locBtn) locBtn.classList.remove('tool-locating');
      },
      () => {
        setPlace('位置未授权');
        s2.locHint.textContent = '已跳过定位，可在设置中开启';
        if (locBtn) locBtn.classList.remove('tool-locating');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }
  function setPlace(p) {
    s2Place = p.replace(/^写于\s*/, '');
    s2.place.textContent = '写于 ' + s2Place;
  }

  // 工具栏
  $('#tool-text').addEventListener('click', () => s2.editor.focus());
  $('#tool-photo').addEventListener('click', () => openCaptureSheet('photo'));
  $('#tool-video').addEventListener('click', () => openCaptureSheet('video'));
  $('#tool-draw').addEventListener('click', openDraw);
  $('#tool-loc').addEventListener('click', requestLocation);
  const toolUndo = $('#tool-undo');
  if (toolUndo) toolUndo.addEventListener('click', () => {
    s2.editor.focus();
    try { document.execCommand('undo'); } catch (e) {}
  });

  // 保存（完成）——支持新建与「重新编辑」（编辑时保留原日期/时间，可改定位地址）
  let editNoteId = null;
  const doneBtn = $('.nav-done');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      const text = (s2.editor.innerText || '').trim();
      if (!text && s2.media.length === 0) { editNoteId = null; showScreen('screen-1'); return; }
      const mediaMap = () => s2.media.map((m) => ({ kind: m.kind, mediaId: m.mediaId, src: m.src, svg: m.svg, dur: m.dur }));
      if (editNoteId) {
        const note = DB.data.notes.find((x) => x.id === editNoteId);
        if (note) {
          note.body = text;
          note.media = mediaMap();
          note.place = s2Place;  // 允许在重新编辑时更新定位地址
          DB.save();
        }
        editNoteId = null;
        renderS1Notes();
        showScreen('screen-1');
        return;
      }
      DB.addNote({ date: TODAY, time: nowHM(), place: s2Place, body: text, media: mediaMap() });
      renderS1Notes();
      showScreen('screen-1');
    });
  }
  // 离开屏2（返回）即取消编辑态，避免误覆盖其他随记
  const s2back = $('#screen-2 .nav-back');
  if (s2back) s2back.addEventListener('click', () => { editNoteId = null; });

  // ---------- 绘图弹层 ----------
  const drawModal = $('#drawModal');
  const drawCanvas = $('#drawCanvas');
  const dctx = drawCanvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let dColor = '#1A1918', dSize = 4, drawing = false, lastX = 0, lastY = 0, strokes = [];
  function openDraw() { drawModal.classList.add('open'); requestAnimationFrame(resizeDraw); }
  function closeDraw() { drawModal.classList.remove('open'); }
  function resizeDraw() {
    const r = drawCanvas.getBoundingClientRect();
    if (!r.width) return;
    drawCanvas.width = r.width * dpr;
    drawCanvas.height = r.height * dpr;
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.lineCap = 'round'; dctx.lineJoin = 'round';
  }
  function posOf(e) {
    const r = drawCanvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    const p = posOf(e);
    lastX = p.x; lastY = p.y;
    try { strokes.push(dctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height)); } catch (err) {}
    dctx.beginPath(); dctx.moveTo(p.x, p.y); dctx.lineTo(p.x, p.y);
    dctx.strokeStyle = dColor; dctx.lineWidth = dSize; dctx.stroke();
  }
  function moveDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = posOf(e);
    dctx.beginPath(); dctx.moveTo(lastX, lastY); dctx.lineTo(p.x, p.y);
    dctx.strokeStyle = dColor; dctx.lineWidth = dSize; dctx.stroke();
    lastX = p.x; lastY = p.y;
  }
  function endDraw() { drawing = false; }
  drawCanvas.addEventListener('pointerdown', startDraw);
  drawCanvas.addEventListener('pointermove', moveDraw);
  window.addEventListener('pointerup', endDraw);
  $('#drawColors').addEventListener('click', (e) => {
    const b = e.target.closest('.dc'); if (!b) return;
    dColor = b.dataset.c;
    $$('#drawColors .dc').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#drawSizes').addEventListener('click', (e) => {
    const b = e.target.closest('.ds'); if (!b) return;
    dSize = +b.dataset.s;
    $$('#drawSizes .ds').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#drawUndo').addEventListener('click', () => {
    if (strokes.length) { try { dctx.putImageData(strokes.pop(), 0, 0); } catch (err) {} }
  });
  $('#drawClear').addEventListener('click', () => { dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); strokes = []; });
  $('#drawClose').addEventListener('click', closeDraw);
  $('#drawSave').addEventListener('click', () => {
    drawCanvas.toBlob((blob) => {
      if (!blob) { closeDraw(); return; }
      const url = URL.createObjectURL(blob);
      SuiDB.storeMedia(blob).then((d) => { d.kind = 'drawing'; d._url = url; addComposeMedia(d); });
      closeDraw();
    }, 'image/png');
  });
  $$('#drawColors .dc')[0].classList.add('active');
  $$('#drawSizes .ds')[1].classList.add('active');

  // 进入屏 2 时初始化编辑器（自动生成北京时间、默认地点）
  function initS2() {
    s2.editor.innerHTML = '';
    s2.media = [];
    renderTray();
    const d = bjNow();
    const wd = _wd[d.getDay()];
    const pad = (n) => String(n).padStart(2, '0');
    s2.time.textContent = nowHM();
    s2.date.textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${wd}`;
    // 同步顶部 nav-title-main（之前是硬编码「7月28日 周二」，initS2 不会刷新它，导致「写新手记」场景下日期一直停留在旧值）
    const main = $('#screen-2 .nav-title-main');
    if (main) main.textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${wd}`;
    const sub = $('#screen-2 .nav-title-sub');
    if (sub) sub.textContent = `${nowHM()} 开始书写`;
    s2Place = userPlaceCache || '位置待授权';
    s2.place.textContent = '写于 ' + s2Place;
    s2.locHint.textContent = userPlaceCache
      ? `已基于你的实时定位 · 点"定位"可重新获取`
      : '结束记录时自动生成 · 点"定位"获取地点';
  }
  // ---------- 屏 5：记账录入（真实键盘 + 保存） ----------
  let curAmt = '0';
  let s5Date = '';
  const s5DateInput = $('#s5-date-input');
  const amtVal = $('#s5-amount-val');
  const amtSub = $('#s5-amount-sub');
  function paintAmt() { if (amtVal) amtVal.textContent = curAmt; }
  // 默认记账日期：落在当前查看的月份内（若查看的是往期月份，则默认记到该月）
  function defaultS5Date() {
    const cm = curMonth;
    const y = +cm.slice(0, 4), m = +cm.slice(5, 7);
    const last = new Date(y, m, 0).getDate();
    const d = Math.min(bjNow().getDate(), last);
    return `${cm}-${_p2(d)}`;
  }
  function paintS5Sub() {
    const grp = isExpenseMode() ? '#s5-expense-cats' : '#s5-income-cats';
    const act = $(grp + ' .s5-cat-active');
    const cat = act ? act.querySelector('.s5-cat-name').textContent.trim() : '其他';
    if (amtSub) amtSub.textContent = cat + ' · ' + (s5Date || defaultS5Date());
    updateDateBtn();
  }
  // 屏5：日期键显式显示当前记账日期（默认落入当前查看的月份），点按可改
  function updateDateBtn() {
    const el = document.getElementById('s5-date-btn'); if (!el) return;
    const d = s5Date || defaultS5Date();
    const parts = (d || '').split('-');
    const day = parts[2] ? String(parseInt(parts[2], 10)) : '';
    const m = parts[1] ? String(parseInt(parts[1], 10)) : '';
    el.innerHTML = `<span class="kp-date-num">${day}</span><span class="kp-date-cap">${m}月</span>`;
    // 若查看的是往期月份，按钮提示将记入该月
    const viewingPast = curMonth !== TODAY.slice(0, 7);
    el.title = viewingPast ? `记账日期：${d}（将记入 ${monthLabel(curMonth)}）` : `记账日期：${d}（点击可更改）`;
  }
  function resetKeypad() { curAmt = '0'; paintAmt(); s5Date = defaultS5Date(); setType('expense'); }
  function pressDigit(d) {
    if (curAmt === '0') curAmt = d; else curAmt += d;
    const parts = curAmt.split('.');
    if (parts[1] && parts[1].length > 2) curAmt = parts[0] + '.' + parts[1].slice(0, 2);
    if ((curAmt.match(/\./g) || []).length > 1) curAmt = curAmt.slice(0, -1);
    paintAmt();
  }
  function pressDot() { if (!curAmt.includes('.')) { curAmt += '.'; paintAmt(); } }
  function pressDel() { curAmt = curAmt.slice(0, -1) || '0'; paintAmt(); }
  function isExpenseMode() { const t = $('#screen-5 .s5-tab-active'); return !t || t.textContent.trim() === '支出'; }
  function visibleCatGroup() { return isExpenseMode() ? '#s5-expense-cats' : '#s5-income-cats'; }
  function setType(type) {
    const exp = type === 'expense';
    $$('#screen-5 .s5-tab').forEach((tb) =>
      tb.classList.toggle('s5-tab-active', (tb.textContent.trim() === '支出') === exp)
    );
    const expGrp = $('#s5-expense-cats'), incGrp = $('#s5-income-cats');
    if (expGrp) expGrp.hidden = !exp;
    if (incGrp) incGrp.hidden = exp;
    const grid = $('#screen-5 .s5-grid'); if (grid) grid.classList.toggle('income', !exp);
    const grp = exp ? '#s5-expense-cats' : '#s5-income-cats';
    let act = $(grp + ' .s5-cat-active');
    if (!act) { act = $(grp + ' .s5-cat'); if (act) act.classList.add('s5-cat-active'); }
    paintS5Sub();
  }
  function saveBill() {
    const amount = parseFloat(curAmt) || 0;
    if (amount <= 0) return;
    const exp = isExpenseMode();
    const grp = exp ? '#s5-expense-cats' : '#s5-income-cats';
    const catEl = $(grp + ' .s5-cat-active');
    const category = catEl ? catEl.querySelector('.s5-cat-name').textContent.trim() : '其他';
    const noteEl = $('#s5-note-input');
    const noteVal = noteEl ? noteEl.value.trim() : '';
    const billDate = s5Date || defaultS5Date();
    DB.addBill({
      type: exp ? 'expense' : 'income',
      amount,
      category,
      note: noteVal || (category + (exp ? ' · 支出' : ' · 收入')),
      time: nowHM(),
      date: billDate
    });
    if (noteEl) noteEl.value = '';
    renderS4Bills();
    showScreen('screen-4');
  }

  $$('#screen-5 .kp').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key || btn.textContent.trim();
      if (k === 'del') pressDel();
      else if (k === 'add') setType('income');
      else if (k === 'sub') setType('expense');
      else if (k === 'date') openS5DatePicker();
      else if (k === 'ok') saveBill();
      else if (k === '.') pressDot();
      else if (/^\d$/.test(k)) pressDigit(k);
    });
  });
  // 屏5：真实日期选择（弹起系统日期选择器，写入记账日期，使账单归入所选月份）
  function openS5DatePicker() {
    if (!s5DateInput) return;
    if (!s5Date) s5Date = defaultS5Date();
    s5DateInput.value = s5Date;
    s5DateInput.min = '2000-01-01';
    s5DateInput.max = todayISO();
    try { if (s5DateInput.showPicker) s5DateInput.showPicker(); else s5DateInput.click(); }
    catch (e) { s5DateInput.click(); }
  }
  if (s5DateInput) s5DateInput.addEventListener('change', () => {
    if (s5DateInput.value) { s5Date = s5DateInput.value; paintS5Sub(); toast('记账日期：' + s5Date); }
  });
  // 分类选择 + 同步副标题（仅在当前显示的组内切换）
  $$('#screen-5 .s5-cat').forEach((c) => {
    c.addEventListener('click', () => {
      const grp = c.closest('#s5-expense-cats, #s5-income-cats');
      if (grp) grp.querySelectorAll('.s5-cat').forEach((x) => x.classList.remove('s5-cat-active'));
      c.classList.add('s5-cat-active');
      paintS5Sub();
    });
  });
  // 点击「支出 / 收入」标签切换
  $$('#screen-5 .s5-tab').forEach((tb) => {
    tb.addEventListener('click', () => setType(tb.textContent.trim() === '支出' ? 'expense' : 'income'));
  });
  const navSave = $('.nav-save');
  if (navSave) navSave.addEventListener('click', saveBill);

  // ---------- 重置示例数据 ----------
  const resetBtn = $('#resetData');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      DB.reset();
      state.weeklyNote = 'wn30'; state.weeklyBill = 'wb30'; state.monthly = 'mb7';
      curMonth = DB.monthKeys()[0] || '2026-07';
      renderAll();
      showScreen('screen-1');
    });
  }

  // ---------- 屏 8：我的（资料 + 数据管理） ----------
  const USER_KEY = 'suisui_user_v1';
  function loadUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)) || {}; } catch (e) { return {}; } }
  function saveUser(u) { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch (e) {} }
  const s8name = $('#s8-name'), s8sign = $('#s8-sign'), s8avatar = $('#s8-avatar');
  const s8user = loadUser();
  if (s8name) s8name.value = s8user.name || '';
  if (s8sign) s8sign.value = s8user.sign || '';
  function applyS8Avatar() {
    if (s8user.avatar) {
      s8avatar.style.backgroundImage = `url('${s8user.avatar}')`;
      s8avatar.textContent = '';
      s8avatar.classList.add('has-img');
    } else {
      s8avatar.style.backgroundImage = '';
      s8avatar.textContent = ((s8name && s8name.value.trim()) || '随').charAt(0);
      s8avatar.classList.remove('has-img');
    }
  }
  applyS8Avatar();
  if (s8name) s8name.addEventListener('input', () => { s8user.name = s8name.value.trim(); saveUser(s8user); applyS8Avatar(); });
  if (s8sign) s8sign.addEventListener('input', () => { s8user.sign = s8sign.value.trim(); saveUser(s8user); });

  // 头像上传（拍照 / 相册）→ 裁剪
  const s8avaCam = $('#s8-ava-cam'), s8avaAlbum = $('#s8-ava-album');
  const s8camIn = $('#s8-ava-cam-input'), s8albIn = $('#s8-ava-album-input');
  function pickAvatar(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => openCrop(r.result);
    r.readAsDataURL(f);
    input.value = '';
  }
  // 头像按钮改为在真实用户手势中调用 input.click()，比 <label for> 在 Android 上更稳定可靠
  if (s8avaCam && s8camIn) s8avaCam.addEventListener('click', () => s8camIn.click());
  if (s8avaAlbum && s8albIn) s8avaAlbum.addEventListener('click', () => s8albIn.click());
  if (s8camIn) s8camIn.addEventListener('change', () => pickAvatar(s8camIn));
  if (s8albIn) s8albIn.addEventListener('change', () => pickAvatar(s8albIn));

  // 头像裁剪弹层（正方形框选，可缩放/拖动）
  const avaCropModal = $('#avaCropModal'), avaCropView = $('#avaCropView');
  const avaCropImg = $('#avaCropImg'), avaCropZoom = $('#avaCropZoom');
  const avaCropDone = $('#avaCropDone'), avaCropCancel = $('#avaCropCancel');
  let cropState = null, cropDrag = null, cropOpenAt = 0;
  function openCrop(dataUrl) {
    avaCropModal.hidden = false;
    cropOpenAt = Date.now();
    const img = new Image();
    img.onload = () => {
      const S = Math.round(avaCropView.getBoundingClientRect().width) || 300;
      const nw = img.naturalWidth || S, nh = img.naturalHeight || S;
      const base = Math.max(S / nw, S / nh);
      const W = nw * base, H = nh * base;
      cropState = { img, base, scale: 1, S, panX: (S - W) / 2, panY: (S - H) / 2 };
      avaCropZoom.value = 1;
      avaCropImg.onload = updateCrop;
      avaCropImg.src = dataUrl;
      requestAnimationFrame(updateCrop);
    };
    img.onerror = () => { avaCropModal.hidden = true; cropState = null; toast('图片无法读取，请换一张试试'); };
    img.src = dataUrl;
  }
  function clampPan() {
    if (!cropState) return;
    const W = cropState.img.naturalWidth * cropState.base * cropState.scale;
    const H = cropState.img.naturalHeight * cropState.base * cropState.scale;
    const S = cropState.S;
    cropState.panX = Math.min(0, Math.max(S - W, cropState.panX));
    cropState.panY = Math.min(0, Math.max(S - H, cropState.panY));
  }
  function updateCrop() {
    if (!cropState) return;
    const { base, scale, panX, panY } = cropState;
    avaCropImg.style.transform = `translate(${panX}px, ${panY}px) scale(${base * scale})`;
  }
  function closeCrop() { avaCropModal.hidden = true; cropState = null; cropDrag = null; }
  if (avaCropZoom) avaCropZoom.addEventListener('input', () => {
    if (!cropState) return;
    cropState.scale = parseFloat(avaCropZoom.value) || 1;
    clampPan(); updateCrop();
  });
  if (avaCropView) {
    avaCropView.addEventListener('pointerdown', (e) => {
      if (!cropState) return;
      cropDrag = { x: e.clientX, y: e.clientY, px: cropState.panX, py: cropState.panY };
      try { avaCropView.setPointerCapture(e.pointerId); } catch (err) {}
    });
    avaCropView.addEventListener('pointermove', (e) => {
      if (!cropDrag) return;
      cropState.panX = cropDrag.px + (e.clientX - cropDrag.x);
      cropState.panY = cropDrag.py + (e.clientY - cropDrag.y);
      clampPan(); updateCrop();
    });
    const end = () => { cropDrag = null; };
    avaCropView.addEventListener('pointerup', end);
    avaCropView.addEventListener('pointercancel', end);
  }
  if (avaCropDone) avaCropDone.addEventListener('click', () => {
    if (!cropState) return;
    const { img, base, scale, panX, panY, S } = cropState;
    const actual = base * scale;
    const sx = -panX / actual, sy = -panY / actual, sw = S / actual, sh = S / actual;
    const OUT = 256;
    const c = document.createElement('canvas'); c.width = OUT; c.height = OUT;
    const cx = c.getContext('2d');
    try { cx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT, OUT); } catch (e) {}
    s8user.avatar = c.toDataURL('image/png');
    saveUser(s8user); applyS8Avatar(); closeCrop(); toast('头像已更新');
  });
  if (avaCropCancel) avaCropCancel.addEventListener('click', closeCrop);
  if (avaCropModal) {
    const m = avaCropModal.querySelector('[data-ava-crop-close]');
    if (m) m.addEventListener('click', () => {
      // 打开后的极短时间内忽略遮罩误触关闭（避免系统文件选择器返回时派发的杂散点击）
      if (Date.now() - cropOpenAt < 450) return;
      closeCrop();
    });
  }

  const s8export = $('#s8-export');
  if (s8export) s8export.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(DB.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'suisui-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const s8reset = $('#s8-reset');
  if (s8reset) s8reset.addEventListener('click', () => {
    showConfirm('清空本地数据', '将删除你所有的手记与账单，且无法恢复。确定要清空吗？', () => {
      DB.clearAll(); renderAll(); showScreen('screen-8'); toast('已清空本地数据');
    });
  });

  // ---------- 屏4：月份切换（内联下拉）/ 汉堡菜单 / 左滑删除 ----------
  const s4monthBtn = $('#s4-month-btn'), s4monthDrop = $('#s4-month-drop');
  function availableMonths() {
    const keys = new Set(DB.monthKeys());
    DB.data.monthlyBillReports.forEach((r) => { const k = reportMonthKey(r); if (k) keys.add(k); });
    return [...keys].sort().reverse();
  }
  function buildS4MonthDrop() {
    const list = availableMonths();
    const box = $('#s4-month-drop');
    if (box) box.innerHTML = list.map((k) =>
      `<button type="button" class="drop-item ${k === curMonth ? 'active' : ''}" data-m="${k}">${esc(monthLabel(k))}</button>`).join('');
  }
  if (s4monthBtn) s4monthBtn.addEventListener('click', () => toggleDrop(s4monthDrop, buildS4MonthDrop));
  if (s4monthDrop) s4monthDrop.addEventListener('click', (e) => {
    const it = e.target.closest('[data-m]');
    if (!it) return;
    curMonth = it.dataset.m; s4monthDrop.hidden = true; renderS4Bills();
  });

  const s4menuBtn = $('#s4-menu-btn'), s4menu = $('#s4-menu');
  function toggleS4Menu(force) { if (!s4menu) return; const show = force !== undefined ? force : s4menu.hidden; s4menu.hidden = !show; }
  if (s4menuBtn) s4menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleS4Menu(); });
  if (s4menu) s4menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-act]'); if (!item) return;
    toggleS4Menu(false);
    const act = item.dataset.act;
    if (act === 'month') { state.monthly = 'mb7'; renderS7(); showScreen('screen-7'); }
    else if (act === 'week') { state.weeklyBill = 'wb30'; renderS6(); showScreen('screen-6'); }
    else if (act === 'export') { exportMonthBills(); }
    else if (act === 'about') { toast('记账数据仅保存在本机浏览器，可随时导出备份'); }
  });
  document.addEventListener('click', () => { if (s4menu && !s4menu.hidden) toggleS4Menu(false); });
  function exportMonthBills() {
    const list = DB.billsByMonth(curMonth);
    const blob = new Blob([JSON.stringify({ month: curMonth, bills: list }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `suisui-bills-${curMonth}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('本月账单已导出');
  }

  // 左滑露出删除按钮：平时隐藏，左滑后停在右侧露出精致小红块；点删除才删除
  let swActive = null, swStartX = 0, swStartY = 0;
  const DEL_W = 54;  // 露出宽度（与 .flow-del 宽度一致）
  function closeAllSwipes(except) {
    $$('.flow-item.flow-revealed').forEach((it) => { if (it !== except) resetSwipeItem(it); });
  }
  function resetSwipeItem(item) {
    item.classList.remove('flow-revealed');
    const c = item.querySelector('.flow-content'); if (c) { c.style.transition = 'transform 0.2s ease'; c.style.transform = ''; }
  }
  function initSwipeDelete() {
    const root = $('#s4-bills');
    if (!root) return;
    root.addEventListener('pointerdown', (e) => {
      const item = e.target.closest('.flow-item'); if (!item) return;
      // 点删除按钮不在这里处理
      if (e.target.closest('.flow-del')) return;
      swActive = item; swStartX = e.clientX; swStartY = e.clientY;
      const c = item.querySelector('.flow-content'); if (c) c.style.transition = '';
    });
    root.addEventListener('pointermove', (e) => {
      if (!swActive) return;
      const dx = e.clientX - swStartX, dy = e.clientY - swStartY;
      if (Math.abs(dx) > Math.abs(dy)) {
        // 已露出的可右滑关闭
        const wasOpen = swActive.classList.contains('flow-revealed');
        let t = wasOpen ? (dx - DEL_W) : dx;
        if (t > 0) t = 0;
        if (t < -DEL_W) t = -DEL_W;
        const c = swActive.querySelector('.flow-content');
        if (c) c.style.transform = `translateX(${t}px)`;
        if (t <= -DEL_W / 2) swActive.classList.add('flow-revealed');
        else swActive.classList.remove('flow-revealed');
      }
    });
    function finish(e) {
      if (!swActive) return;
      const item = swActive, c = item.querySelector('.flow-content');
      const dx = e.clientX - swStartX;
      // 滑动距离足够 → 锁定为露出状态；否则回弹
      if (dx < -DEL_W / 3) {
        if (c) { c.style.transition = 'transform 0.22s ease'; c.style.transform = `translateX(-${DEL_W}px)`; }
        item.classList.add('flow-revealed');
        closeAllSwipes(item);
      } else {
        if (c) { c.style.transition = 'transform 0.18s ease'; c.style.transform = ''; }
        item.classList.remove('flow-revealed');
      }
      swActive = null;
    }
    root.addEventListener('pointerup', finish);
    root.addEventListener('pointercancel', finish);
    root.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        DB.deleteBill(del.dataset.del); renderS4Bills(); toast('已删除该条记账');
        return;
      }
      // 点击已露出的卡片其它区域 → 关闭
      const it = e.target.closest('.flow-item');
      if (it && it.classList.contains('flow-revealed') && !e.target.closest('.flow-del')) {
        resetSwipeItem(it);
      }
    });
  }
  initSwipeDelete();

  // ---------- 屏8：深色模式 / 记账提醒 ----------
  function applyTheme(t) {
    const m = t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.setAttribute('data-theme', m);
    $$('#s8-theme .s8-seg-item').forEach((b) => b.classList.toggle('active', b.dataset.theme === t));
    s8user.theme = t; saveUser(s8user);
  }
  const themeSeg = $('#s8-theme');
  if (themeSeg) themeSeg.addEventListener('click', (e) => { const b = e.target.closest('[data-theme]'); if (b) applyTheme(b.dataset.theme); });
  applyTheme(s8user.theme || 'light');
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((s8user.theme || 'light') === 'system') applyTheme('system'); });

  const REM_KEY = 'suisui_reminder_v1';
  let reminder = { enabled: false, time: '21:00' };
  try { const r = JSON.parse(localStorage.getItem(REM_KEY)); if (r) reminder = r; } catch (e) {}
  const remOn = $('#s8-remind-on'), remTime = $('#s8-remind-time');
  function saveReminder() { try { localStorage.setItem(REM_KEY, JSON.stringify(reminder)); } catch (e) {} }
  let remTimer = null;
  function scheduleReminder() {
    clearTimeout(remTimer);
    if (!reminder.enabled) return;
    const [h, m] = reminder.time.split(':').map(Number);
    const now = new Date(); const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    remTimer = setTimeout(fireReminder, target - now);
  }
  function fireReminder() {
    const today = DB.data.bills.some((b) => b.date === TODAY);
    if (!today) {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('随遂记账提醒', { body: '今天还没记账哦，记得记一笔～' });
      } else {
        toast('记账提醒：今天还没记账，记一笔吧～');
      }
    }
    scheduleReminder();
  }
  if (remOn) {
    remOn.checked = !!reminder.enabled;
    remOn.addEventListener('change', () => {
      reminder.enabled = remOn.checked;
      saveReminder(); scheduleReminder();
      if (remOn.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    });
  }
  if (remTime) {
    remTime.value = reminder.time || '21:00';
    remTime.addEventListener('change', () => { reminder.time = remTime.value; saveReminder(); scheduleReminder(); });
  }

  // ---------- 画布导出 / 分享工具 ----------
  // 圆角路径
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // 自动换行
  function wrapLines(ctx, text, maxW) {
    const out = [];
    // 先按用户的换行（\n / \r\n）分段，保留其手写排版；每段再按宽度折行
    const paras = String(text).split(/\r?\n/);
    for (const para of paras) {
      if (para === '') { out.push(''); continue; } // 用户手写的空行也要保留
      const chars = para.split('');
      let line = '';
      for (const ch of chars) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = ch; }
        else line = test;
      }
      if (line) out.push(line);
    }
    return out;
  }
  // 截断省略
  function truncText(ctx, text, maxW) {
    text = String(text);
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }
  // 深色模式兼容：保持米色纸感在深色下也优雅
  function themeColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark
      ? { bg: '#262018', card: '#312A1F', text: '#EFE7D6', muted: '#B4A688', green: '#7BB893', coral: '#E0A98C', beige: '#3A3122', brown: '#C9A98C', divider: '#3A3122' }
      : { bg: '#F5F4F1', card: '#FFFFFF', text: '#1A1918', muted: '#6D6C6A', green: '#3D8A5A', coral: '#D08068', beige: '#F2EBDC', brown: '#B08968', divider: '#E8E5DD' };
  }

  // 字体加载保障：确保所有汉字（含"哇"等）都能正常显示，避免手写体缺字
  const FONT_SERIF = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';
  const FONT_NUM = '"Inter", "Noto Sans SC", sans-serif';
  let _fontsReady = false;
  async function ensureFonts() {
    if (_fontsReady) return;
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load('400 12px ' + FONT_SERIF),
          document.fonts.load('500 16px ' + FONT_SERIF),
          document.fonts.load('600 22px ' + FONT_SERIF),
          document.fonts.load('400 12px ' + FONT_NUM)
        ]);
        await document.fonts.ready;
      }
    } catch (e) {}
    _fontsReady = true;
  }
  // 柔美衬线字体（思源宋体，覆盖全部常用汉字，不会缺字；非加粗以保持文艺柔和）
  function fontFace(weight, size, kind) {
    const fam = (kind === 'num') ? FONT_NUM : FONT_SERIF;
    return `${weight || 400} ${size}px ${fam}`.trim();
  }

  // 纸感配色：随记分享=护眼浅绿；周/月账单=清透浅薄荷蓝；周整理/账单导出=米色
  const PAPER_NOTE = {  // 护眼浅绿（单条随记分享）
    bg: '#E8F1E2', card: '#F2F8EC', border: '#A9C49B', text: '#2F3B2A',
    sub: '#5E6E54', faint: '#8AA07C', accent: '#5A6F4A', accent2: '#7E9A6E',
    warm: '#C2A06A', depth: '#3F5236'
  };
  const PAPER_BILL = {  // 清透浅薄荷蓝（周/月账单分享）
    bg: '#E6F3F5', card: '#F2F9FA', border: '#AFD0D6', text: '#234A4E',
    sub: '#4E6E72', faint: '#8FB4BA', accent: '#3E7C84', accent2: '#5E9AA1',
    warm: '#C9A23B', depth: '#2C6B73'
  };
  const SHARE_PAPER = {  // 米色（周整理报告 / 账单导出）
    bg: '#F4ECDB', card: '#FBF6E8', border: '#D6C9A8', text: '#6A5A42',
    sub: '#8A7A60', faint: '#A89B7B', accent: '#5A6F4A', accent2: '#B08968',
    warm: '#D9A26A', depth: '#5A4632'
  };
  // 分享图统一边距：边框线距画布边缘 BORD_INSET；内容距边缘 CONTENT_INSET（与边框留白、不重叠）
  const BORD_INSET = 16;
  const CONTENT_INSET = 58;

  // 装饰边框：四角卷草花卉 + 细线连接（文艺信纸风）
  function drawOneCorner(ctx, kind) {
    // 坐标原点 = 该角的拐点；tl 不变换，tr/bl/br 通过 scale(-1, ±1) 翻转
    ctx.save();
    ctx.scale(0.72, 0.72); // 缩小角饰，使其落在 BORD_INSET + 角饰清除区之内，避免与内容重叠
    const f = (p) => new Path2D(p);
    const paths = [
      // 外 L 边框（细线，圆角拐弯）
      f('M 0 42 L 0 10 Q 0 0 10 0 L 42 0'),
      // 卷须（主涡卷）
      f('M 14 8 C 26 6 32 16 28 24 C 24 30 16 28 18 22 C 19 18 23 18 23 21'),
      // 叶片
      f('M 34 10 C 46 10 50 22 40 24 C 34 20 34 14 34 10 Z'),
      // 叶片纹路
      f('M 38 13 C 41 16 43 19 42 22'),
      // 小弧/副卷须
      f('M 8 34 C 8 28 14 26 18 30 C 20 32 18 36 14 35')
    ];
    ctx.beginPath();
    paths.forEach((p) => ctx.stroke(p));
    // 装饰小点（花蕊）
    const dots = [[44, 8, 1.6], [52, 6, 1], [48, 14, 1], [22, 34, 1.1], [14, 40, 0.9], [40, 4, 0.8]];
    ctx.fillStyle = ctx.strokeStyle;
    dots.forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }
  function drawCorners(ctx, x, y, w, h, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const L = 44; // 角饰占位
    // 四角
    ctx.save(); ctx.translate(x, y); drawOneCorner(ctx, 'tl'); ctx.restore();
    ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); drawOneCorner(ctx, 'tr'); ctx.restore();
    ctx.save(); ctx.translate(x, y + h); ctx.scale(1, -1); drawOneCorner(ctx, 'bl'); ctx.restore();
    ctx.save(); ctx.translate(x + w, y + h); ctx.scale(-1, -1); drawOneCorner(ctx, 'br'); ctx.restore();
    // 四边细线（连接角饰）
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(x + L, y); ctx.lineTo(x + w - L, y);
    ctx.moveTo(x + w, y + L); ctx.lineTo(x + w, y + h - L);
    ctx.moveTo(x + L, y + h); ctx.lineTo(x + w - L, y + h);
    ctx.moveTo(x, y + L); ctx.lineTo(x, y + h - L);
    ctx.stroke();
    ctx.restore();
  }
  // 载入图片（处理跨域）
  function loadImg(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  // 在圆角矩形内绘制图片（cover 裁剪）
  function drawImageCover(ctx, img, x, y, w, h, radius) {
    if (!img) return;
    ctx.save();
    rr(ctx, x, y, w, h, radius);
    ctx.clip();
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) { ctx.restore(); return; }
    const r = Math.max(w / iw, h / ih);
    const dw = iw * r, dh = ih * r;
    const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }
  // 在圆角矩形内绘制图片（contain 不裁切、保留原比例，含背景垫底）
  function drawImageFit(ctx, img, x, y, w, h, radius) {
    if (!img) return;
    ctx.save();
    // 圆角背景（与边框内层融合）
    if (radius) { rr(ctx, x, y, w, h, radius); ctx.fillStyle = 'rgba(0,0,0,0.04)'; ctx.fill(); }
    rr(ctx, x, y, w, h, radius);
    ctx.clip();
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) { ctx.restore(); return; }
    const r = Math.min(w / iw, h / ih); // contain，不放大超过原图
    const dw = iw * r, dh = ih * r;
    const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }
  // ----- 通用：纸底 + 装饰边框（含卷草花卉角饰） + 底部"随遂 APP 生成" -----
  function drawShareShell(ctx, W, H, C) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    drawCorners(ctx, BORD_INSET, BORD_INSET, W - BORD_INSET * 2, H - BORD_INSET * 2, C.border);
  }
  function drawShareFooter(ctx, W, H, C) {
    ctx.fillStyle = C.faint;
    ctx.font = fontFace('400', 10, 'sans');
    ctx.textAlign = 'center';
    ctx.fillText('随遂 APP 生成', W / 2, H - BORD_INSET - 14);
    ctx.textAlign = 'left';
  }

  // ---------- 账单导出图 ----------
  function buildBillImage(monthKey, list) {
    const C = SHARE_PAPER;
    const scale = 2, W = 360, pad = CONTENT_INSET;
    const agg = aggregateBills(list);
    const entries = list.slice(0, 18);
    const headH = 90;
    const sumTop = headH + 14;
    const sumH = 80;
    const catTop = sumTop + sumH + 22;
    const catH = 28 + agg.ecats.length * 28;
    const listTop = catTop + catH + 18;
    const listH = 26 + entries.length * 30;
    const H = listTop + listH + 60;
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    drawShareShell(ctx, W, H, C);
    // 标题
    ctx.fillStyle = C.text; ctx.font = fontFace('700', 20, 'hand');
    ctx.fillText(monthLabel(monthKey) + ' 账单汇总', pad, 52);
    ctx.fillStyle = C.sub; ctx.font = fontFace('400', 12, 'sans');
    ctx.fillText('共 ' + list.length + ' 笔 · 随遂记录', pad, 74);
    // 三栏汇总
    const sw = (W - pad * 2 - 16) / 3;
    [{ t: '支出', v: '¥' + fmtMoney(agg.expense), col: C.accent2 },
     { t: '收入', v: '¥' + fmtMoney(agg.income), col: C.accent },
     { t: '结余', v: '¥' + fmtMoney(agg.balance), col: C.text }].forEach((s, i) => {
      const x = pad + i * (sw + 8), y = sumTop;
      ctx.fillStyle = C.card; rr(ctx, x, y, sw, sumH, 12); ctx.fill();
      ctx.strokeStyle = C.border; ctx.stroke();
      ctx.fillStyle = C.sub; ctx.font = fontFace('400', 11, 'sans'); ctx.fillText(s.t, x + 12, y + 22);
      // 金额字号缩小到 13 + tabular-nums 等宽 + 测量收敛，保证 ¥18,500.00 / ¥19,300.00 等长金额完整展示不溢出列宽
      ctx.fillStyle = s.col;
      let vSize = 13;
      ctx.font = fontFace('700', vSize, 'num');
      while (ctx.measureText(s.v).width > sw - 18 && vSize > 9) { vSize -= 1; ctx.font = fontFace('700', vSize, 'num'); }
      ctx.fillText(s.v, x + 12, y + 52);
    });
    // 分类
    ctx.fillStyle = C.text; ctx.font = fontFace('600', 13, 'hand'); ctx.fillText('支出分类', pad, catTop);
    agg.ecats.forEach((cat, i) => {
      const y = catTop + 16 + i * 28;
      ctx.fillStyle = cat.color; ctx.beginPath(); ctx.arc(pad + 5, y - 4, 5, 0, 7); ctx.fill();
      ctx.fillStyle = C.text; ctx.font = fontFace('400', 12, 'sans'); ctx.fillText(cat.name, pad + 18, y);
      ctx.fillStyle = C.sub; ctx.textAlign = 'right'; ctx.font = fontFace('400', 11, 'num');
      ctx.fillText('¥' + fmtMoney(cat.exp) + ' · ' + cat.pct + '%', W - pad, y); ctx.textAlign = 'left';
    });
    // 明细
    ctx.fillStyle = C.text; ctx.font = fontFace('600', 13, 'hand'); ctx.fillText('近期明细', pad, listTop);
    entries.forEach((b, i) => {
      const y = listTop + 14 + i * 30;
      ctx.fillStyle = C.text; ctx.font = fontFace('400', 12, 'sans');
      ctx.fillText(truncText(ctx, (b.type === 'income' ? '+' : '-') + (b.category || '') + '  ' + (b.note || ''), W - pad * 2 - 100), pad, y);
      ctx.fillStyle = b.type === 'income' ? C.accent : C.accent2; ctx.textAlign = 'right';
      ctx.font = fontFace('600', 12, 'num');
      ctx.fillText('¥' + fmtMoney(b.amount), W - pad, y); ctx.textAlign = 'left';
    });
    drawShareFooter(ctx, W, H, C);
    return c;
  }

  // ---------- 周/月账单报告图 ----------
  function buildReportImage(r, mode) {
    const C = PAPER_BILL;
    const scale = 2, W = 360, pad = CONTENT_INSET;
    const items = mode === 'week' ? r.daily.map((d) => ({ label: d.day, val: d.val })) : r.weeks.map((w) => ({ label: w.label, val: w.val }));
    // 顶部日期：周→"2026.7.13 - 2026.7.19"；月→"月度汇总"
    const m = String(r.range || '').match(/(\d{1,2})\.(\d{1,2})\s*[–\-]\s*(\d{1,2})\.(\d{1,2})/);
    const subText = mode === 'week'
      ? (m ? `2026.${m[1]}.${m[2]} - 2026.${m[3]}.${m[4]}` : (r.range || ''))
      : '月度汇总';
    const titleText = mode === 'week' ? (r.week + ' 周账单') : (r.month + ' 月度收支');
    // 布局
    const sumTop = 96;                 // 三栏汇总（相对标题下移）
    const chartTop = sumTop + 74;      // 柱状图（与汇总留间距）
    const chartH = 118;
    const catTop = chartTop + chartH + 60; // 支出分类（与柱状图留足间距，呼吸感更好）
    const catRowH = 30;
    const insTop = catTop + 22 + r.cats.length * catRowH + 26;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = fontFace('400', 12, 'serif');
    const insLines = wrapLines(probe, r.insight || '', W - pad * 2 - 24);
    const insLineH = 17, insPadY = 14;
    const insH = insPadY * 2 + 18 + insLines.length * insLineH + (insLines.length ? 4 : 0);
    const H = insTop + insH + 46;     // 页脚下移
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    drawShareShell(ctx, W, H, C);
    // 标题（同色系更深色，非黑）
    ctx.fillStyle = C.depth; ctx.font = fontFace('700', 20, 'serif');
    ctx.fillText(titleText, pad, 52);
    // 副标题（日期 / 月度汇总）左对齐、微微下移
    ctx.fillStyle = C.sub; ctx.font = fontFace('400', 13, 'serif');
    ctx.fillText(subText, pad, 76);
    // 三栏汇总：标签放大、金额跟随标题字体；金额字号自适应收敛，避免 ¥18,500.00 等长金额溢出列宽
    const nw = (W - pad * 2) / 3;
    [{ t: mode === 'week' ? '支出' : '月支出', v: '¥' + fmtMoney(r.expense) },
     { t: '收入', v: '¥' + fmtMoney(r.income) },
     { t: '结余', v: '¥' + fmtMoney(r.balance) }].forEach((n, i) => {
      const x = pad + i * nw, y = sumTop;
      ctx.fillStyle = C.sub; ctx.font = fontFace('400', 13, 'serif'); ctx.fillText(n.t, x, y);
      ctx.fillStyle = C.text;
      let vSize = 13;
      ctx.font = fontFace('600', vSize, 'serif');
      while (ctx.measureText(n.v).width > nw - 4 && vSize > 9) { vSize -= 1; ctx.font = fontFace('600', vSize, 'serif'); }
      ctx.fillText(n.v, x, y + 24);
    });
    // 柱状图
    const max = Math.max(1, ...items.map((d) => d.val || 0));
    const cw = (W - pad * 2 - (items.length - 1) * 6) / items.length;
    items.forEach((d, i) => {
      const x = pad + i * (cw + 6);
      const h = Math.max(6, Math.round((d.val || 0) / max * chartH));
      const y = chartTop + chartH - h;
      ctx.fillStyle = C.accent2; rr(ctx, x, y, cw, h, 4); ctx.fill();
      ctx.fillStyle = C.sub; ctx.font = fontFace('400', 9, 'num'); ctx.textAlign = 'center';
      ctx.fillText(String(d.val || 0), x + cw / 2, y - 4);
      ctx.fillText(d.label, x + cw / 2, chartTop + chartH + 12); ctx.textAlign = 'left';
    });
    // 支出分类（下移、同色系、与标签一致字号）
    ctx.fillStyle = C.depth; ctx.font = fontFace('600', 14, 'serif'); ctx.fillText('支出分类', pad, catTop);
    r.cats.forEach((cat, i) => {
      const y = catTop + 22 + i * catRowH;
      ctx.fillStyle = cat.color; ctx.beginPath(); ctx.arc(pad + 4, y - 4, 5, 0, 7); ctx.fill();
      ctx.fillStyle = C.text; ctx.font = fontFace('400', 13, 'serif'); ctx.fillText(cat.name, pad + 16, y);
      ctx.fillStyle = C.sub; ctx.textAlign = 'right'; ctx.font = fontFace('400', 13, 'num');
      ctx.fillText('¥' + fmtMoney(cat.amount) + ' | ' + cat.pct + '%', W - pad, y); ctx.textAlign = 'left';
    });
    // 洞察（文本框随内容自适应大小，上下左右间距一致）
    ctx.fillStyle = C.card; rr(ctx, pad, insTop, W - pad * 2, insH, 12); ctx.fill();
    ctx.strokeStyle = C.border; ctx.stroke();
    ctx.fillStyle = C.accent2; ctx.font = fontFace('600', 13, 'serif');
    ctx.fillText(mode === 'week' ? '本周洞察' : '本月洞察', pad + 12, insTop + insPadY + 4);
    ctx.fillStyle = C.text; ctx.font = fontFace('400', 12, 'serif');
    insLines.forEach((ln, i) => ctx.fillText(ln, pad + 12, insTop + insPadY + 22 + i * insLineH));
    drawShareFooter(ctx, W, H, C);
    return c;
  }

  // ---------- 周整理报告图 ----------
  function buildWeeklyReportImage(r) {
    const C = SHARE_PAPER;
    const scale = 2, W = 360, pad = CONTENT_INSET;
    // 顶部：标题 + 左对齐日期 + 左对齐统计
    const m = String(r.range || '').match(/(\d{1,2})\.(\d{1,2})\s*[–\-]\s*(\d{1,2})\.(\d{1,2})/);
    const dateStr = m ? `2026.${m[1]}.${m[2]}-2026.${m[3]}.${m[4]}` : (r.range || '');
    const statsLine = `本周记录 ${r.total} 条 · 附图频 ${r.images} 张 · 涂鸦 ${r.doodles} 幅`;
    const catTop = 118;
    const catRowH = 54;
    const catH = NOTE_CATS.length * catRowH + 8;
    const kwTop = catTop + catH + 34;
    // 关键词 chips 布局（先测量）
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = fontFace('400', 15, 'serif');
    const kwItems = (r.keywords || []).map((k) => ({ k, w: Math.max(72, probe.measureText(k).width + 32) }));
    const lineH = 44, kwGap = 10;
    let cx = pad, cy = kwTop + 64; const kwBoxes = [];
    kwItems.forEach((it) => {
      if (cx + it.w > W - pad) { cx = pad; cy += lineH + 6; }
      kwBoxes.push({ k: it.k, x: cx, y: cy, w: it.w });
      cx += it.w + kwGap;
    });
    const kwContentH = (cy - (kwTop + 64)) + lineH + 8;
    const kwBoxH = 64 + kwContentH + 16;
    const H = kwTop + kwBoxH + 56; // 页脚下移
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    drawShareShell(ctx, W, H, C);
    // 标题（同色系深棕，柔和衬线，不黑不粗）
    ctx.fillStyle = C.depth; ctx.font = fontFace('700', 19, 'serif');
    ctx.fillText(r.week + ' 手记整理', pad, 52);
    // 日期（放大、左对齐、与标题左端对齐）
    ctx.fillStyle = C.sub; ctx.font = fontFace('400', 14, 'serif');
    ctx.fillText(dateStr, pad, 74);
    // 统计小字（左对齐）
    ctx.fillStyle = C.sub; ctx.font = fontFace('400', 12, 'serif');
    ctx.fillText(statsLine, pad, 98);
    // 分类（放大、同色系、数字用衬线小一号）
    const maxC = Math.max(1, ...NOTE_CATS.map((s) => r.stats[s.k] || 0));
    NOTE_CATS.forEach((d, i) => {
      const yRow = catTop + 8 + i * catRowH;
      const cnt = r.stats[d.k] || 0;
      ctx.fillStyle = d.color; rr(ctx, pad, yRow, 6, catRowH - 16, 3); ctx.fill();
      ctx.fillStyle = C.text; ctx.font = fontFace('500', 16, 'serif'); ctx.fillText(d.name, pad + 18, yRow + 22);
      ctx.fillStyle = d.color; ctx.font = fontFace('500', 18, 'serif'); ctx.textAlign = 'right';
      ctx.fillText(cnt + '', W - pad, yRow + 26);
      ctx.textAlign = 'left';
      const barX = pad + 18, barY = yRow + 34, barW = W - pad - 18 - 80, barH = 5;
      ctx.fillStyle = d.color + '22'; rr(ctx, barX, barY, barW, barH, 2.5); ctx.fill();
      ctx.fillStyle = d.color; rr(ctx, barX, barY, barW * (cnt / maxC), barH, 2.5); ctx.fill();
    });
    // 关键词板块（放大、深橙框、内留白、去白边框）
    ctx.fillStyle = C.warm + '22'; rr(ctx, pad - 4, kwTop + 6, W - pad * 2 + 8, kwBoxH, 16); ctx.fill();
    ctx.strokeStyle = C.warm; ctx.lineWidth = 1.5; rr(ctx, pad - 4, kwTop + 6, W - pad * 2 + 8, kwBoxH, 16); ctx.stroke();
    ctx.fillStyle = C.depth; ctx.font = fontFace('600', 16, 'serif');
    ctx.fillText('本周关键词', pad + 6, kwTop + 34);
    kwBoxes.forEach((b) => {
      ctx.fillStyle = C.warm + '1f'; rr(ctx, b.x, b.y, b.w, lineH - 8, (lineH - 8) / 2); ctx.fill();
      ctx.fillStyle = C.accent2; ctx.font = fontFace('400', 15, 'serif');
      ctx.textAlign = 'center';
      ctx.fillText(b.k, b.x + b.w / 2, b.y + (lineH - 8) / 2 + 7);
      ctx.textAlign = 'left';
    });
    drawShareFooter(ctx, W, H, C);
    return c;
  }

  // ---------- 单条随记分享图 ----------
  // 返回 { canvas, hasVideo, videoUrl }
  // ---------- 单条随记分享（文艺浅绿纸 + 无页眉 + 正文为主体 + 图片视频原比例） ----------
  // 计算图片在边框内的展示尺寸：保留原宽高比，单图铺满（限 maxW/maxH），多图竖排
  function fitInside(img, maxW, maxH) {
    const iw = (img && (img.naturalWidth || img.width)) || 1;
    const ih = (img && (img.naturalHeight || img.height)) || 1;
    const r = Math.min(maxW / iw, maxH / ih, 1); // 不放大
    const w = Math.round(iw * r), h = Math.round(ih * r);
    return { w, h };
  }
  async function buildNoteShareCanvas(note) {
    await ensureFonts();
    const C = PAPER_NOTE;
    const scale = 2, W = 360, pad = CONTENT_INSET;
    const innerW = W - pad * 2;            // 316
    const media = (note.media && note.media.length) ? note.media : legacyMedia(note);
    const images = media.filter((m) => m.kind === 'image' || m.kind === 'drawing');
    const loadedImgs = await Promise.all(images.map(async (m) => {
      let src = m.src;
      if (!src && m.mediaId) src = await SuiDB.mediaURL(m.mediaId);
      if (!src && m.svg) src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120">' + m.svg + '</svg>');
      return loadImg(src);
    }));
    const validImgs = loadedImgs.filter(Boolean);
    const bodyText = (note.body || '').trim() || (validImgs.length ? '' : '（空白手记）');
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = fontFace('400', 15, 'serif');
    const bodyLines = wrapLines(probe, bodyText, innerW);
    const lineH = 26;
    const bodyTop = 56;
    // 媒体区：单图过大限制高度；多图统一全宽、按原比例完整显示（竖屏/横屏视觉一致全宽）
    const medGap = 10;
    const medMaxSingleH = 560;
    const medItems = validImgs.map((img) => {
      const iw = (img.naturalWidth || img.width) || 1, ih = (img.naturalHeight || img.height) || 1;
      let w = innerW, h = Math.round(innerW * ih / iw);
      if (validImgs.length === 1 && h > medMaxSingleH) { h = medMaxSingleH; w = Math.round(medMaxSingleH * iw / ih); }
      return { img, w, h, x: pad, y: 0 }; // 左缘与正文对齐：边缘到边框距离同正文
    });
    let medY = bodyTop + (bodyLines.length ? bodyLines.length * lineH : 0) + (bodyLines.length ? 22 : 0);
    medItems.forEach((it) => { it.y = medY; medY += it.h + medGap; });
    const sigTop = medY - (validImgs.length ? medGap : 0) + (validImgs.length ? 22 : 0);
    const H = sigTop + 70;
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    drawShareShell(ctx, W, H, C);
    // 正文（主体，置于顶部，无页眉）
    if (bodyLines.length) {
      ctx.fillStyle = C.text; ctx.font = fontFace('400', 15, 'serif');
      bodyLines.forEach((ln, i) => ctx.fillText(ln, pad, bodyTop + 18 + i * lineH));
    }
    // 图片/绘画：保留原比例，圆角，统一在边框内
    medItems.forEach((it) => {
      drawImageFit(ctx, it.img, it.x, it.y, it.w, it.h, 8);
    });
    // 结尾：小字日期 · 时间 · 地点
    ctx.fillStyle = C.sub; ctx.font = fontFace('400', 12, 'serif');
    const sigLine = [note.date ? monthShort(note.date) : '', note.time || '', note.place ? '· ' + note.place : ''].filter(Boolean).join('    ');
    ctx.fillText(sigLine, pad, sigTop + 14);
    drawShareFooter(ctx, W, H, C);
    return { canvas: c, hasVideo: !!media.find((m) => m.kind === 'video') };
  }

  // 通用：分享 canvas
  function shareCanvas(canvas, filename, title, fallbackMsg) {
    canvas.toBlob(async (blob) => {
      if (!blob) { toast('生成图片失败'); return; }
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); return; } catch (e) {}
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(fallbackMsg || '已生成分享图片，可保存后分享');
    }, 'image/png');
  }

  // 含视频手记：把文字 / 图片 / 绘画 / 视频全部合成到一个视频文件（图片/视频保留原比例）
  async function composeNoteVideo(note) {
    const C = PAPER_NOTE;
    const scale = 2, W = 360, pad = CONTENT_INSET;
    const innerW = W - pad * 2;
    const media = (note.media && note.media.length) ? note.media : legacyMedia(note);
    const images = media.filter((m) => m.kind === 'image' || m.kind === 'drawing');
    const videoMeta = media.find((m) => m.kind === 'video');
    const validImgs = (await Promise.all(images.map(async (m) => {
      let src = m.src; if (!src && m.mediaId) src = await SuiDB.mediaURL(m.mediaId);
      if (!src && m.svg) src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120">' + m.svg + '</svg>');
      return loadImg(src);
    }))).filter(Boolean);
    const bodyText = (note.body || '').trim() || '（空白手记）';
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = fontFace('400', 15, 'serif');
    const bodyLines = wrapLines(probe, bodyText, innerW);
    const lineH = 26;
    const bodyTop = 56;
    const medGap = 10;
    const medMaxSingleH = 560;
    const medItems = validImgs.map((img) => {
      const iw = (img.naturalWidth || img.width) || 1, ih = (img.naturalHeight || img.height) || 1;
      let w = innerW, h = Math.round(innerW * ih / iw);
      if (validImgs.length === 1 && h > medMaxSingleH) { h = medMaxSingleH; w = Math.round(medMaxSingleH * iw / ih); }
      return { img, w, h, x: pad, y: 0 };
    });
    let medY = bodyTop + (bodyLines.length ? bodyLines.length * lineH : 0) + (bodyLines.length ? 22 : 0);
    medItems.forEach((it) => { it.y = medY; medY += it.h + medGap; });
    // 视频（保留原比例）
    const vidMaxH = 520;
    let vidW = innerW, vidH = 180; // 默认 fallback
    let vidX = pad, vidY = medY - (validImgs.length ? medGap : 0) + (validImgs.length ? 18 : 0);
    // 载入视频元素以取 naturalWidth/Height（音频稍后单独接入，见下方 audioDest）
    let videoEl = null;
    if (videoMeta) {
      let src = videoMeta.src; if (!src && videoMeta.mediaId) src = await SuiDB.mediaURL(videoMeta.mediaId);
      if (src) {
        videoEl = document.createElement('video');
        videoEl.src = src; videoEl.muted = true; videoEl.loop = false; videoEl.playsInline = true;
        videoEl.preload = 'auto';
        await new Promise((res) => { videoEl.onloadedmetadata = res; videoEl.onerror = res; });
        const vw = videoEl.videoWidth || innerW;
        const vh = videoEl.videoHeight || 320;
        const r = Math.min(innerW / vw, vidMaxH / vh, 1);
        vidW = Math.round(vw * r);
        vidH = Math.round(vh * r);
      }
    }
    vidX = pad;
    const sigTop = vidY + vidH + 22;
    const H = sigTop + 70;
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    function drawPoster() {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      drawCorners(ctx, BORD_INSET, BORD_INSET, W - BORD_INSET * 2, H - BORD_INSET * 2, C.border);
      ctx.fillStyle = C.text; ctx.font = fontFace('400', 15, 'serif');
      bodyLines.forEach((ln, i) => ctx.fillText(ln, pad, bodyTop + 18 + i * lineH));
      // 图片/绘画（原比例）
      medItems.forEach((it) => drawImageFit(ctx, it.img, it.x, it.y, it.w, it.h, 8));
      // 视频（原比例）
      if (videoEl) {
        ctx.save(); rr(ctx, vidX, vidY, vidW, vidH, 10); ctx.clip();
        if (videoEl.readyState >= 2) ctx.drawImage(videoEl, vidX, vidY, vidW, vidH);
        else { ctx.fillStyle = C.card; ctx.fillRect(vidX, vidY, vidW, vidH); }
        ctx.restore();
        ctx.strokeStyle = C.border; ctx.lineWidth = 1; rr(ctx, vidX, vidY, vidW, vidH, 10); ctx.stroke();
      }
      ctx.fillStyle = C.sub; ctx.font = fontFace('400', 12, 'serif');
      const sigLine = [note.date ? monthShort(note.date) : '', note.time || '', note.place ? '· ' + note.place : ''].filter(Boolean).join('    ');
      ctx.fillText(sigLine, pad, sigTop);
      drawShareFooter(ctx, W, H, C);
    }
    if (!c.captureStream || typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
      drawPoster(); return { canvas: c }; // 不支持时退化为静态图（仍含全部内容）
    }

    // ——— 声音：canvas.captureStream() 只有画面轨，必须把原视频的音轨接进来 ———
    // 做法：WebAudio 把 <video> 的输出接到 MediaStreamDestination（不接扬声器 → 生成时不外放）
    let audioCtx = null, audioDest = null, audioTracks = [];
    if (videoEl) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          audioCtx = new AC();
          if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (e) {} }
          const srcNode = audioCtx.createMediaElementSource(videoEl);
          audioDest = audioCtx.createMediaStreamDestination();
          srcNode.connect(audioDest); // 只连采集端，不连 audioCtx.destination
          videoEl.muted = false; videoEl.volume = 1; // 经 WebAudio 路由，muted 会导致采不到声音
          audioTracks = audioDest.stream.getAudioTracks();
        }
      } catch (e) { audioCtx = null; audioDest = null; audioTracks = []; }
    }

    const stream = c.captureStream(30);
    audioTracks.forEach((t) => { try { stream.addTrack(t); } catch (e) {} });
    const hasAudio = stream.getAudioTracks().length > 0;

    const cands = hasAudio
      ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    let mime = '';
    for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) { mime = m; break; } } catch (e) {} }
    let rec;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch (e) { rec = new MediaRecorder(stream); }
    if (!mime) mime = rec.mimeType || 'video/webm';

    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((res) => { rec.onstop = res; });

    // 完整播放原视频（最长 60 秒），画面与声音同步录进分享视频
    const vdur = videoEl && isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
    const dur = vdur ? Math.min(60, Math.max(2, vdur)) : 4;
    let ended = false;
    if (videoEl) {
      videoEl.onended = () => { ended = true; };
      try { videoEl.currentTime = 0; } catch (e) {}
      try { await videoEl.play(); }
      catch (e) {
        // 自动播放被策略拦截 → 退回静音播放（此时分享视频无声，但仍能生成）
        try { videoEl.muted = true; await videoEl.play(); } catch (e2) {}
      }
    }
    rec.start(200);
    const start = performance.now();
    await new Promise((resolve) => {
      function tick() {
        drawPoster();
        const timeUp = performance.now() - start >= dur * 1000 + 120;
        if (!ended && !timeUp) requestAnimationFrame(tick);
        else { try { rec.stop(); } catch (e) {} resolve(); }
      }
      requestAnimationFrame(tick);
    });
    await stopped;
    try { if (videoEl) videoEl.pause(); } catch (e) {}
    try { if (audioCtx) audioCtx.close(); } catch (e) {}
    if (!chunks.length) { drawPoster(); return { canvas: c }; }
    const blob = new Blob(chunks, { type: mime });
    return { blob, mime, ext: mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm' };
  }

  // 单条随记分享：含视频 → 合成视频文件（含文字/图/绘/视频）；否则分享图
  async function shareNoteImage(note) {
    const media = (note.media && note.media.length) ? note.media : legacyMedia(note);
    const hasVideo = !!media.find((m) => m.kind === 'video');
    if (hasVideo) {
      let res = null;
      toast('正在合成视频（含原声）…');
      try { res = await composeNoteVideo(note); } catch (e) { res = null; }
      if (res && res.blob) {
        const filename = 'suisui-note-' + (note.id || Date.now()) + '.' + (res.ext || 'mp4');
        const file = new File([res.blob], filename, { type: res.mime || 'video/mp4' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: '随遂 · 随记' }); return; } catch (e) {}
        }
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast('已生成视频文件，可保存后分享');
        return;
      }
      // 退化：分享含全部内容的静态图
      const info = await buildNoteShareCanvas(note);
      shareCanvas(info.canvas, 'suisui-note-' + (note.id || Date.now()) + '.png', '随遂 · 随手记', '已生成随记图片，可保存后分享');
      return;
    }
    const info = await buildNoteShareCanvas(note);
    shareCanvas(info.canvas, 'suisui-note-' + (note.id || Date.now()) + '.png', '随遂 · 随手记', '已生成随记图片，可保存后分享');
  }

  // 周/月账单报告分享
  function shareReport(mode) {
    let r;
    if (mode === 'week') {
      const base = DB.data.weeklyBillReports.find((x) => x.id === state.weeklyBill) || DB.data.weeklyBillReports[0];
      r = computeWeekReport(base);
    } else {
      const base = DB.data.monthlyBillReports.find((x) => x.id === state.monthly) || DB.data.monthlyBillReports[0];
      r = computeMonthReport(base);
    }
    const canvas = buildReportImage(r, mode);
    shareCanvas(canvas, 'suisui-' + mode + '-' + Date.now() + '.png', '随遂 · ' + (mode === 'week' ? '周账单' : '月度收支分析'), '已生成分享图片，可保存后分享');
  }

  const s6share = $('#s6-share'), s7share = $('#s7-share'), s3share = $('#s3-share');
  if (s6share) s6share.addEventListener('click', () => shareReport('week'));
  if (s7share) s7share.addEventListener('click', () => shareReport('month'));
  if (s3share) s3share.addEventListener('click', () => {
    const raw = DB.data.weeklyNoteReports.find((x) => x.id === state.weeklyNote) || DB.data.weeklyNoteReports[0];
    const r = computeWeekNoteReport(raw);
    const canvas = buildWeeklyReportImage(r);
    shareCanvas(canvas, 'suisui-weekly-' + (r.id || Date.now()) + '.png', '随遂 · 周整理报告', '已生成周整理图片，可保存后分享');
  });

  // 屏3「本周关键词」：点击编辑、长按右上角×删除、＋添加（持久化到 userKeywords）
  (function initKeywordEdit() {
    const root = $('#s3-report');
    if (!root) return;
    let lpTimer = null, longPressed = false;
    function rep() { return DB.data.weeklyNoteReports.find((x) => x.id === state.weeklyNote) || DB.data.weeklyNoteReports[0]; }
    function curList() {
      const r = rep();
      return (r.userKeywords && r.userKeywords.length) ? r.userKeywords : computeWeekNoteReport(r).keywords.slice();
    }
    function saveList(list) { const r = rep(); r.userKeywords = list; DB.save(); renderS3(); }
    function startEdit(chip) {
      const idx = +chip.dataset.idx;
      const cur = chip.dataset.kw || '';
      const input = document.createElement('input');
      input.className = 'kw-edit-input';
      input.value = cur;
      chip.replaceWith(input);
      input.focus(); input.select();
      const commit = () => {
        const v = input.value.trim();
        const list = curList();
        if (v) list[idx] = v; else list.splice(idx, 1);
        saveList(list);
      };
      input.addEventListener('blur', commit, { once: true });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { input.value = cur; input.blur(); }
      });
    }
    function addKw() {
      const list = curList(); list.push(''); saveList(list);
      const chips = root.querySelectorAll('.kw-chip');
      const last = chips[chips.length - 1];
      if (last) startEdit(last);
    }
    root.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('.kw-chip'); if (!chip) return;
      longPressed = false;
      lpTimer = setTimeout(() => {
        longPressed = true;
        root.querySelectorAll('.kw-chip.show-x').forEach((c) => c.classList.remove('show-x'));
        chip.classList.add('show-x');
      }, 500);
    });
    const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
    root.addEventListener('pointerup', clearLp);
    root.addEventListener('pointermove', clearLp);
    root.addEventListener('click', (e) => {
      const x = e.target.closest('.kw-x');
      if (x) {
        const chip = x.closest('.kw-chip');
        const list = curList(); list.splice(+chip.dataset.idx, 1); saveList(list);
        return;
      }
      if (e.target.closest('#kw-add')) { addKw(); return; }
      const chip = e.target.closest('.kw-chip');
      if (chip) {
        if (longPressed) {
          longPressed = false;
          root.querySelectorAll('.kw-chip.show-x').forEach((c) => c.classList.remove('show-x'));
          return;
        }
        startEdit(chip);
      }
    });
  })();

  // ---------- 屏1：搜索 + 长按操作 + 月份选择 ----------
  const s1searchBtn = $('#s1-search-btn'), s1searchbar = $('#s1-searchbar'), s1searchInput = $('#s1-search-input'), s1searchClear = $('#s1-search-clear');
  if (s1searchBtn) s1searchBtn.addEventListener('click', () => {
    if (!s1searchbar) return;
    s1searchbar.hidden = !s1searchbar.hidden;
    if (!s1searchbar.hidden && s1searchInput) s1searchInput.focus();
  });
  if (s1searchInput) s1searchInput.addEventListener('input', () => { s1Query = s1searchInput.value; renderS1Notes(); });
  if (s1searchClear) s1searchClear.addEventListener('click', () => { s1Query = ''; if (s1searchInput) s1searchInput.value = ''; renderS1Notes(); });

  // 屏1 月份选择（左上角内联下拉）
  const s1monthBtn = $('#s1-month-btn'), s1monthDrop = $('#s1-month-drop');
  if (s1monthBtn) s1monthBtn.addEventListener('click', () => toggleDrop(s1monthDrop, buildS1MonthDrop));
  if (s1monthDrop) s1monthDrop.addEventListener('click', (e) => {
    const it = e.target.closest('[data-m]'); if (!it) return;
    state.curNoteMonth = it.dataset.m;
    s1monthDrop.hidden = true;
    renderS1MonthLabel(); renderS1Notes();
  });

  // 屏3 往期周报选择（左上角内联下拉）
  const s3weekBtn = $('#s3-week-btn'), s3weekDrop = $('#s3-week-drop');
  if (s3weekBtn) s3weekBtn.addEventListener('click', () => toggleDrop(s3weekDrop, buildS3WeekDrop));
  if (s3weekDrop) s3weekDrop.addEventListener('click', (e) => {
    const it = e.target.closest('[data-w]'); if (!it) return;
    state.weeklyNote = it.dataset.w;
    s3weekDrop.hidden = true;
    renderS3();
  });

  // 屏6 往期周账单选择（左上角内联下拉）
  const s6weekBtn = $('#s6-week-btn'), s6weekDrop = $('#s6-week-drop');
  if (s6weekBtn) s6weekBtn.addEventListener('click', () => toggleDrop(s6weekDrop, buildS6WeekDrop));
  if (s6weekDrop) s6weekDrop.addEventListener('click', (e) => {
    const it = e.target.closest('[data-dw]'); if (!it) return;
    state.weeklyBill = it.dataset.dw;
    s6weekDrop.hidden = true;
    renderS6();
  });

  // 屏7 往期月度收支选择（左上角内联下拉）
  const s7monthBtn = $('#s7-month-btn'), s7monthDrop = $('#s7-month-drop');
  if (s7monthBtn) s7monthBtn.addEventListener('click', () => toggleDrop(s7monthDrop, buildS7MonthDrop));
  if (s7monthDrop) s7monthDrop.addEventListener('click', (e) => {
    const it = e.target.closest('[data-dm]'); if (!it) return;
    state.monthly = it.dataset.dm;
    s7monthDrop.hidden = true;
    renderS7();
  });

  const s1ctx = $('#s1-ctx');
  let s1ctxId = null;
  function openCtx(id) {
    const n = DB.data.notes.find((x) => x.id === id);
    s1ctxId = id;
    const pinBtn = s1ctx && s1ctx.querySelector('[data-ctx="pin"]');
    if (pinBtn) pinBtn.textContent = n && n.pinned ? '取消置顶' : '置顶到顶部';
    if (s1ctx) s1ctx.hidden = false;
  }
  function closeCtx() { if (s1ctx) s1ctx.hidden = true; }
  if (s1ctx) {
    s1ctx.addEventListener('click', (e) => {
      if (e.target.closest('[data-ctx-close]')) { closeCtx(); return; }
      const act = e.target.closest('[data-ctx]'); if (!act || !s1ctxId) return;
      const id = s1ctxId; closeCtx();
      const note = DB.data.notes.find((n) => n.id === id);
      if (!note) return;
      if (act.dataset.ctx === 'del') { DB.deleteNote(id); renderS1Notes(); toast('已删除该条手记'); }
      else if (act.dataset.ctx === 'pin') { note.pinned = !note.pinned; DB.save(); renderS1Notes(); toast(note.pinned ? '已置顶到顶部' : '已取消置顶'); }
    });
  }
  const s1notes = $('#s1-notes');
  if (s1notes) {
    let lpTimer = null, lpX = 0, lpY = 0, lpId = null;
    const cancelLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
    s1notes.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.card'); if (!card) return;
      lpId = card.dataset.id; lpX = e.clientX; lpY = e.clientY;
      lpTimer = setTimeout(() => { if (lpId) openCtx(lpId); }, 550);
    });
    s1notes.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - lpX) > 10 || Math.abs(e.clientY - lpY) > 10) cancelLp(); });
    s1notes.addEventListener('pointerup', cancelLp);
    s1notes.addEventListener('pointercancel', cancelLp);
    s1notes.addEventListener('scroll', cancelLp, true);
    s1notes.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // 点按卡片打开详情（长按仍触发菜单，互不冲突）
  if (s1notes) {
    s1notes.addEventListener('click', (e) => {
      if (s1ctx && !s1ctx.hidden) return;
      if (e.target.closest('[data-detail-close],[data-ctx]')) return;
      const card = e.target.closest('.card'); if (!card || !card.dataset.id) return;
      openDetail(card.dataset.id);
    });
  }

  // ---------- 屏1：随记详情（查看 / 分享 / 重新编辑） ----------
  const s1detail = $('#s1-detail'), s1detailBody = $('#s1-detail-body');
  let s1detailId = null;
  function openDetail(id) {
    const n = DB.data.notes.find((x) => x.id === id);
    if (!n) return;
    s1detailId = id;
    s1detailBody.innerHTML = noteCard(n);
    resolveMedia(s1detailBody);
    s1detail.hidden = false;
  }
  function closeDetail() { if (s1detail) s1detail.hidden = true; s1detailId = null; }
  if (s1detail) {
    s1detail.addEventListener('click', (e) => { if (e.target.closest('[data-detail-close]')) closeDetail(); });
    const s1de = $('#s1-detail-edit');
    if (s1de) s1de.addEventListener('click', () => { const id = s1detailId; closeDetail(); if (id) startEdit(id); });
    const s1ds = $('#s1-detail-share');
    if (s1ds) s1ds.addEventListener('click', () => { const id = s1detailId; const n = DB.data.notes.find((x) => x.id === id); if (n) shareNoteImage(n); });
  }

  // ---------- 屏2：重新编辑（保留原日期 / 地点 / 时间） ----------
  async function startEdit(id) {
    const note = DB.data.notes.find((x) => x.id === id);
    if (!note) return;
    editNoteId = id;
    showScreen('screen-2');                 // 内部 initS2 会先重置编辑器
    s2.editor.innerText = note.body || '';
    const media = note.media && note.media.length ? note.media : legacyMedia(note);
    s2.media = [];
    for (const m of media) {
      const desc = { kind: m.kind, mediaId: m.mediaId, src: m.src, svg: m.svg, dur: m.dur };
      if (m.mediaId) desc._url = await SuiDB.mediaURL(m.mediaId);
      else if (m.src) desc._url = m.src;
      else if (m.svg) desc._url = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120">' + m.svg + '</svg>');
      s2.media.push(desc);
    }
    renderTray();
    s2.time.textContent = note.time || nowHM();
    s2.date.textContent = note.date || '';
    s2Place = (note.place || '').replace(/^写于\s*/, '');
    s2.place.textContent = note.place ? '写于 ' + s2Place : '写于 位置待授权';
    const sub = $('#screen-2 .nav-title-sub');
    if (sub) sub.textContent = '编辑中 · 日期与地点保持不变';
    const main = $('#screen-2 .nav-title-main');
    if (main) main.textContent = note.date || '编辑手记';
  }

  // ---------- 屏3：分类展开 / 关键词点开 / 分类面板（可编辑、可拖动改分类） ----------
  const s3report = $('#s3-report');
  if (s3report) {
    s3report.addEventListener('click', (e) => {
      const tg = e.target.closest('[data-cat-toggle]');
      if (tg) { const card = tg.closest('.cat-card'); if (card) card.classList.toggle('expanded'); return; }
      const stat = e.target.closest('[data-cat-key]');
      if (stat) { openS3CatPanel(stat.dataset.catKey); return; }
    });
  }
  const s3detail = $('#s3-detail'), s3detailTitle = $('#s3-detail-title'), s3detailBody = $('#s3-detail-body');
  function openS3Detail(keyword) {
    const r = DB.data.weeklyNoteReports.find((x) => x.id === state.weeklyNote) || DB.data.weeklyNoteReports[0];
    const k = (keyword || '').toLowerCase();
    const items = [];
    r.categories.forEach((c) => c.items.forEach((it) => {
      if (!k || (it.text || '').toLowerCase().includes(k)) items.push({ name: c.name, color: c.color, day: it.day, text: it.text });
    }));
    s3detailTitle.textContent = '关键词 · ' + keyword;
    if (!items.length) {
      s3detailBody.innerHTML = '<div class="s3-detail-empty">本周暂无包含「' + esc(keyword) + '」的随记条目</div>';
    } else {
      s3detailBody.innerHTML = items.map((it) => `
        <div class="s3-detail-item">
          <span class="s3-detail-dot" style="background:${it.color}"></span>
          <div class="s3-detail-textwrap">
            <div class="s3-detail-day">${esc(it.name)} · ${esc(it.day)}</div>
            <div class="s3-detail-text">${esc(it.text)}</div>
          </div>
        </div>`).join('');
    }
    s3detail.hidden = false;
  }
  function closeS3Detail() { if (s3detail) s3detail.hidden = true; }
  if (s3detail) s3detail.addEventListener('click', (e) => { if (e.target.closest('[data-s3d-close]')) closeS3Detail(); });

  // 分类面板（点开分类查看【本周】该分类下的手记、可编辑、可长按拖动改分类）
  const s3cat = $('#s3-cat'), s3catTitle = $('#s3-cat-title'), s3catBody = $('#s3-cat-body'), s3catTargets = $('#s3-cat-targets');
  let s3catCurrentKey = null;
  function openS3CatPanel(key) {
    s3catCurrentKey = key;
    const cat = NOTE_CATS.find((x) => x.k === key) || NOTE_CATS[3];
    // 取当前所选周报告的 [sd, ed] 区间，严格按周圈定
    const raw = DB.data.weeklyNoteReports.find((x) => x.id === state.weeklyNote) || DB.data.weeklyNoteReports[0];
    const wr = computeWeekNoteReport(raw);
    const sd = wr.sd, ed = wr.ed;
    s3catTitle.innerHTML = `<span class="s3cat-dot" style="background:${cat.color}"></span>${esc(cat.name)} <span class="s3cat-subtitle">本周（${esc(wr.range)}）该分类下的手记</span>`;
    // 列出本周 + 该分类 的手记（按 category 名称匹配；缺省归"随心记录"）
    const notes = DB.data.notes.filter((n) => {
      if (n.date < sd || n.date > ed) return false;
      const cn = n.category ? catNameOf(catKOf(n.category)) : '随心记录';
      return cn === cat.name;
    });
    if (!notes.length) {
      s3catBody.innerHTML = '<div class="s3cat-empty">该分类暂无手记</div>';
    } else {
      s3catBody.innerHTML = notes.map((n) => `
        <div class="s3cat-item" data-id="${esc(n.id)}" draggable="true">
          <span class="s3cat-day">${esc(monthShort(n.date))} · ${esc(weekdayName(n.date))} ${esc((n.time || '').slice(0, 5))}</span>
          <div class="s3cat-text">${esc((n.body || '').slice(0, 60) || ((n.media && n.media.length) ? '【' + (n.media[0].kind === 'video' ? '视频' : n.media[0].kind === 'drawing' ? '涂鸦' : '图片') + '】' : '（空白手记）'))}</div>
          <div class="s3cat-acts">
            <button type="button" class="s3cat-edit" data-edit="${esc(n.id)}">编辑</button>
          </div>
        </div>`).join('');
    }
    // 目标分类块（接收拖放）
    s3catTargets.innerHTML = NOTE_CATS.map((c) => `
      <div class="s3cat-target ${c.k === key ? 'is-current' : ''}" data-target-key="${c.k}">
        <span class="s3cat-dot" style="background:${c.color}"></span>
        <span class="s3cat-target-name">${esc(c.name)}</span>
        ${c.k === key ? '<span class="s3cat-target-mark">当前</span>' : ''}
      </div>`).join('');
    s3cat.hidden = false;
  }
  function closeS3Cat() { if (s3cat) s3cat.hidden = true; s3catCurrentKey = null; }
  // 改分类后：同步刷新所有相关统计（周报聚合、屏1列表）
  function moveNoteToCat(id, key) {
    const cat = NOTE_CATS.find((x) => x.k === key);
    DB.setNoteCategory(id, cat ? cat.name : '随心记录');
    toast('已移动到「' + (cat ? cat.name : '随心记录') + '」');
    renderS3(); renderS1Notes();
    openS3CatPanel(s3catCurrentKey);
  }
  if (s3cat) {
    s3cat.addEventListener('click', (e) => {
      if (e.target.closest('[data-s3c-close]')) { closeS3Cat(); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) { const id = ed.dataset.edit; closeS3Cat(); startEdit(id); return; }
      const tgt = e.target.closest('[data-target-key]');
      // 点击分类条：直接切换到对应分类视图
      if (tgt && tgt.dataset.targetKey !== s3catCurrentKey) openS3CatPanel(tgt.dataset.targetKey);
    });
    // 触屏/鼠标通用拖动：长按选中 → 浮块跟手 → 松手落在分类条上即改分类
    let pressTimer = null, dragId = null, dragGhost = null, dragging = false;
    function clearArmed() {
      const it = s3catBody.querySelector('.s3cat-item.s3cat-armed');
      if (it) it.classList.remove('s3cat-armed');
    }
    function moveGhost(x, y) {
      if (dragGhost) { dragGhost.style.left = x + 'px'; dragGhost.style.top = y + 'px'; }
      $$('.s3cat-target').forEach((t) => t.classList.remove('s3cat-target-hover'));
      const el = document.elementFromPoint(x, y);
      const t = el && el.closest ? el.closest('[data-target-key]') : null;
      if (t && t.dataset.targetKey !== s3catCurrentKey) t.classList.add('s3cat-target-hover');
    }
    function endDrag(x, y) {
      if (!dragging) return;
      dragging = false;
      const el = (x != null) ? document.elementFromPoint(x, y) : null;
      const t = el && el.closest ? el.closest('[data-target-key]') : null;
      if (dragGhost) { dragGhost.remove(); dragGhost = null; }
      $$('.s3cat-target').forEach((tt) => tt.classList.remove('s3cat-target-hover'));
      const sel = s3catBody.querySelector('.s3cat-item.s3cat-dragging');
      if (sel) sel.classList.remove('s3cat-dragging');
      if (t && dragId && t.dataset.targetKey !== s3catCurrentKey) moveNoteToCat(dragId, t.dataset.targetKey);
      dragId = null;
    }
    s3catBody.addEventListener('pointerdown', (e) => {
      const it = e.target.closest('.s3cat-item'); if (!it || e.target.closest('[data-edit]')) return;
      const id = it.dataset.id, sx = e.clientX, sy = e.clientY;
      it.classList.add('s3cat-armed');
      pressTimer = setTimeout(() => {
        pressTimer = null;
        clearArmed();
        dragId = id; dragging = true;
        it.classList.add('s3cat-dragging');
        dragGhost = document.createElement('div');
        dragGhost.className = 's3cat-ghost';
        const tx = it.querySelector('.s3cat-text');
        dragGhost.textContent = (tx ? tx.textContent : '') || '手记';
        document.body.appendChild(dragGhost);
        moveGhost(sx, sy);
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
        toast('拖到下方分类条即可移动');
      }, 320);
    });
    s3catBody.addEventListener('pointermove', (e) => {
      if (pressTimer && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) {
        clearTimeout(pressTimer); pressTimer = null; clearArmed();
      }
    });
    document.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      e.preventDefault();
      moveGhost(e.clientX, e.clientY);
    });
    document.addEventListener('pointerup', (e) => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; clearArmed(); }
      if (dragging) endDrag(e.clientX, e.clientY);
    });
    document.addEventListener('pointercancel', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; clearArmed(); }
      if (dragging) endDrag(null, null);
    });
    // 拖动时阻止页面滚动（触屏）
    document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });
    // 桌面 HTML5 拖放（兼容）
    s3catBody.addEventListener('dragstart', (e) => {
      const it = e.target.closest('.s3cat-item'); if (!it) return;
      it.classList.add('s3cat-dragging');
      e.dataTransfer.setData('text/plain', it.dataset.id);
    });
    s3catBody.addEventListener('dragend', (e) => {
      const it = e.target.closest('.s3cat-item'); if (it) it.classList.remove('s3cat-dragging');
    });
    s3catTargets.addEventListener('dragover', (e) => {
      const t = e.target.closest('[data-target-key]'); if (!t) return;
      e.preventDefault();
      t.classList.add('s3cat-target-hover');
    });
    s3catTargets.addEventListener('dragleave', (e) => {
      const t = e.target.closest('[data-target-key]'); if (t) t.classList.remove('s3cat-target-hover');
    });
    s3catTargets.addEventListener('drop', (e) => {
      const t = e.target.closest('[data-target-key]'); if (!t) return;
      e.preventDefault();
      t.classList.remove('s3cat-target-hover');
      const id = e.dataTransfer.getData('text/plain');
      if (!id || t.dataset.targetKey === s3catCurrentKey) return;
      moveNoteToCat(id, t.dataset.targetKey);
    });
  }

  // ---------- 我的：导入文件 + 日历备忘录 ----------
  const s8file = $('#s8-import-file');
  const s8import = $('#s8-import');
  if (s8import && s8file) s8import.addEventListener('click', () => s8file.click());
  if (s8file) {
    s8file.addEventListener('change', () => {
      const f = s8file.files && s8file.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (d && Array.isArray(d.notes) && Array.isArray(d.bills)) {
            DB.replaceData(d); renderAll(); showScreen('screen-8'); toast('导入成功，已恢复你的数据');
          } else { toast('文件格式不正确：缺少 notes / bills'); }
        } catch (e) { toast('解析失败：' + e.message); }
        s8file.value = '';
      };
      r.readAsText(f);
    });
  }
  function buildReminderICS(h, m) {
    const p2 = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SuiSui//Reminder//CN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', 'UID:suisui-reminder-' + now.getTime() + '@suisui', 'DTSTAMP:' + stamp(now),
      'DTSTART:' + stamp(dt), 'DTEND:' + stamp(new Date(dt.getTime() + 10 * 60000)), 'RRULE:FREQ=DAILY',
      'SUMMARY:随遂记账提醒', 'DESCRIPTION:记得记一笔今天的账～',
      'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:随遂记账提醒', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  const s8cal = $('#s8-cal');
  if (s8cal) s8cal.addEventListener('click', () => {
    const [h, m] = (reminder.time || '21:00').split(':').map(Number);
    const blob = new Blob([buildReminderICS(h, m)], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'suisui-reminder.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('日历文件已生成，打开即可加入系统日历');
  });

  // ---------- 启动 ----------
  // 状态栏时钟：跟随真实时间，每 15 秒刷新一次
  function tickClock() { const t = nowHM(); $$('.status-bar .time').forEach((el) => { el.textContent = t; }); }
  tickClock();
  setInterval(tickClock, 15000);
  // 每分钟重算 TODAY（避免跨午夜不变）
  setInterval(() => {
    const nt = todayISO();
    if (nt !== TODAY) { location.reload(); }
  }, 60000);
  // 应用启动后尝试获取一次真实定位（北京时区同理），写到缓存供屏2/历史随记默认使用
  // 用户未授权时静默失败，不打扰
  (function bootGeo() {
    const cached = readGeoCache();
    if (cached) { userPlaceCache = cached.city; }
    else if (navigator.geolocation) {
      // 仅在 https / localhost 下尝试；非安全上下文直接跳过
      try {
        if (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            const city = await fetchCityByCoord(lat, lng) || '当前位置';
            const o = { city, lat, lng, ts: Date.now() };
            writeGeoCache(o);
            userPlaceCache = city;
          }, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
        }
      } catch (e) { /* 忽略 */ }
    }
  })();

  // 启动时兜底：检测 PWA / TWA 启动模式，给 <html> 加 app-standalone 类，
  // 让 CSS 立即切到全屏 App 样式（不依赖某些 WebView 不可靠的 display-mode 媒体查询）
  (function ensureStandaloneClass() {
    try {
      var isStandalone =
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) ||
        (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
        (typeof navigator !== 'undefined' && navigator.standalone === true) ||
        (typeof document !== 'undefined' && (document.referrer || '').indexOf('android-app://') === 0);
      if (isStandalone) document.documentElement.classList.add('app-standalone');
    } catch (e) { /* 忽略 */ }
  })();

  // 新用户首次打开即清空示例数据（仅移动端 / 已安装 App 触发，桌面预览保留样例）。
  // 用一次性标记 suisui_clean_v1 保证只清一次，后续用户新增的数据不会被误删。
  try {
    var _isMobile = window.innerWidth <= 640 ||
      document.documentElement.classList.contains('app-standalone') ||
      document.documentElement.classList.contains('app-narrow');
    if (_isMobile && !localStorage.getItem('suisui_clean_v1')) {
      DB.wipeSamples();
      try { localStorage.setItem('suisui_clean_v1', '1'); } catch (e) {}
    }
  } catch (e) { /* 忽略 */ }

  renderAll();
  showScreen('screen-1');
  scheduleReminder();
})();
