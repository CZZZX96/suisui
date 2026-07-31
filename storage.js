/* ============================================================
 * 随遂 App — 本地数据层 (localStorage + IndexedDB)
 * 随手记录 / 周报告 / 账单 / 周账单 / 月报 的元数据落在 localStorage，
 * 照片、视频、涂鸦等媒体 Blob 落在 IndexedDB，刷新不丢。
 * 新增的笔记（含图片/视频/绘图）通过 addNote 写入并真实留存。
 * ============================================================ */
window.SuiDB = (function () {
  const KEY = 'suisui_db_v3';
  const MDB = 'suisui_media_v3';

  // —— 第 1 屏随手记录（文字 / 图片 / 视频 / 绘图）——
  const doodleSvg = [
    '<path d="M30 60 C45 30, 70 30, 85 60 C100 80, 70 85, 60 65" stroke="#D08068" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    '<path d="M120 55 C135 25, 165 25, 180 55 C195 80, 160 85, 150 60" stroke="#3D8A5A" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    '<circle cx="220" cy="55" r="14" stroke="#B08968" stroke-width="2.5" fill="none"/>',
    '<line x1="220" y1="41" x2="220" y2="38" stroke="#1A1918" stroke-width="2" stroke-linecap="round"/>',
    '<line x1="220" y1="72" x2="220" y2="75" stroke="#1A1918" stroke-width="2" stroke-linecap="round"/>',
    '<line x1="206" y1="55" x2="203" y2="55" stroke="#1A1918" stroke-width="2" stroke-linecap="round"/>',
    '<line x1="237" y1="55" x2="240" y2="55" stroke="#1A1918" stroke-width="2" stroke-linecap="round"/>'
  ].join('');

  // —— 动态种子：以「真实今天（北京时间）」为锚，把示例数据分散到本周 / 上周 / 两周前（周整理、周账单），
  //     以及本月 / 上月 / 上上月（月度收支、屏4月份视图），保证所有报告都是按真实日期聚合出来的。 ——
  function _pad(n) { return String(n).padStart(2, '0'); }
  function _fmt(d) { return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; }
  function _monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const w = x.getDay() || 7; x.setDate(x.getDate() - (w - 1)); return x; }
  function _addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function _weekOfYear(d) { const t = new Date(d.getFullYear(), 0, 1); const diff = Math.floor((d - t) / 86400000); return Math.ceil((diff + t.getDay() + 1) / 7); }
  // 强制用北京时间（Asia/Shanghai, UTC+8）作为种子锚点，避免设备时区不同导致今天/本周/本月错位
  const _bjNow = (() => {
    const n = new Date();
    return new Date(n.getTime() + (n.getTimezoneOffset() + 8 * 60) * 60000);
  })();
  const _today = new Date(_bjNow.getFullYear(), _bjNow.getMonth(), _bjNow.getDate());  // 北京时间今天 0 点
  const _mon = _monday(_today);                       // 本周一（按北京时间计算）
  const _wkMon = (i) => _addDays(_mon, i * 7);       // i=0 本周, -1 上周, -2 两周前
  const _wkRange = (i) => {
    const s = _wkMon(i), e = _addDays(s, 6);
    return { s, e, sd: _fmt(s), ed: _fmt(e), range: `${s.getMonth() + 1}.${s.getDate()} – ${e.getMonth() + 1}.${e.getDate()}`, week: '第 ' + _weekOfYear(s) + ' 周' };
  };
  const _wkDate = (i, day) => _fmt(_addDays(_wkMon(i), day)); // day:0=周一..6=周日
  const _monthInfo = (i) => {
    const y = _bjNow.getFullYear(), m = _bjNow.getMonth() + i;
    const d = new Date(y, m, 1);
    return { y: d.getFullYear(), m: d.getMonth(), key: `${d.getFullYear()}-${_pad(d.getMonth() + 1)}`, label: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月` };
  };

  // 手记：分散到本周 / 上周 / 两周前，覆盖四种分类，正文含可提炼的关键词
  const _noteDefs = [
    // 本周
    { wi:0, day:0, time:'18:42', place:'望京地铁站', category:'创作灵感', body:'地铁上听到一句话："人是靠习惯活着的，靠热爱活得好。" 想把它写进下一篇专栏的开头。', media:[] },
    { wi:0, day:0, time:'19:05', place:'家附近的公园', category:'随心记录', body:'傍晚的云像棉花糖，风也变得软乎乎的。', media:[ { kind:'image', src:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80' } ] },
    { wi:0, day:0, time:'19:32', place:'家楼下便利店', category:'生活事项', body:'录了一段雨后便利店窗上的雾气，配着店里那首老歌，回头剪进 vlog。', media:[ { kind:'video', src:'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80', dur:'0:18' } ] },
    { wi:0, day:1, time:'08:10', place:'驾校', category:'生活事项', body:'今天续完了驾照科目三，下周预约了体检时间。', media:[] },
    { wi:0, day:1, time:'21:02', place:'家', category:'想法状态', body:'最近节奏有点快，想给自己留一个无安排的周六上午。', media:[] },
    { wi:0, day:2, time:'13:20', place:'办公室', category:'创作灵感', body:'把每周手记做成"情绪天气图"，分类当图例，灵感来自今天的晚霞。', media:[] },
    { wi:0, day:3, time:'12:40', place:'写字楼大堂', category:'随心记录', body:'路过花店，拍了张洋桔梗，紫色的好温柔。', media:[ { kind:'image', src:'https://images.unsplash.com/photo-1462275646964-a0e3386b8523?w=800&q=80' } ] },
    { wi:0, day:4, time:'20:15', place:'家', category:'生活事项', body:'给妈妈寄的茶叶到了，记得提醒她签收。', media:[] },
    { wi:0, day:5, time:'17:30', place:'河边', category:'想法状态', body:'雨天让人安静，也许该重新开始晚间散步了。', media:[] },
    { wi:0, day:6, time:'10:05', place:'家', category:'随心记录', body:'翻到上周的随手涂鸦，还是觉得挺可爱的。', media:[ { kind:'drawing', svg: doodleSvg } ] },
    { wi:0, day:6, time:'15:48', place:'咖啡馆', category:'创作灵感', body:'新 logo 灵感：手绘线条 + 云朵图标方向，配色想用米色。', media:[] },
    // 上周
    { wi:-1, day:0, time:'09:30', place:'家', category:'创作灵感', body:'给专栏列了三个选题方向，最后选了"城市夜行"。', media:[] },
    { wi:-1, day:2, time:'11:10', place:'口腔诊所', category:'生活事项', body:'预约了下周的牙医，顺便洗个牙。', media:[] },
    { wi:-1, day:4, time:'22:00', place:'家', category:'想法状态', body:'想学一门新手艺，也许陶艺，周末去探店看看。', media:[] },
    { wi:-1, day:5, time:'16:20', place:'花店', category:'随心记录', body:'路过花店，拍了张洋桔梗，随手记一笔。', media:[ { kind:'image', src:'https://images.unsplash.com/photo-1487070183336-b863922373d4?w=800&q=80' } ] },
    { wi:-1, day:6, time:'19:40', place:'数码店', category:'生活事项', body:'换了新耳机，通勤听播客更舒服了。', media:[] },
    // 两周前
    { wi:-2, day:1, time:'10:00', place:'家', category:'创作灵感', body:'写了篇关于"慢生活"的随笔，发在了公众号。', media:[] },
    { wi:-2, day:3, time:'14:30', place:'美术馆', category:'随心记录', body:'周末看了场展览，很治愈，记一笔留念。', media:[ { kind:'image', src:'https://images.unsplash.com/photo-1531913764164-f85c52e6e654?w=800&q=80' } ] },
    { wi:-2, day:5, time:'12:15', place:'街角', category:'随心记录', body:'随手记的店名，挺有意思的，回头再去看。', media:[] },
    { wi:-2, day:6, time:'21:00', place:'书房', category:'想法状态', body:'这周读完一本关于专注的书，很有启发。', media:[] }
  ];
  const _notes = _noteDefs.map((n, i) => ({
    id: 'n' + (i + 1),
    date: _wkDate(n.wi, n.day),
    time: n.time,
    place: n.place,
    category: n.category,
    body: n.body,
    media: n.media || []
  }));

  // 周账单：本周每天至少一笔（保证"今天/昨天"标签真实出现），上周/两周前各若干笔
  const _billDefs = [
    { wi:0, day:0, type:'expense', time:'12:30', category:'餐饮', note:'午餐 · 轻食沙拉', amount:38.00 },
    { wi:0, day:0, type:'expense', time:'09:15', category:'交通', note:'地铁 · 望京 → 国贸', amount:6.00 },
    { wi:0, day:0, type:'income',  time:'今日到账', category:'兼职', note:'稿费 · 公众号', amount:800.00 },
    { wi:0, day:1, type:'expense', time:'08:05', category:'餐饮', note:'早餐 · 咖啡', amount:12.50 },
    { wi:0, day:2, type:'expense', time:'20:10', category:'购物', note:'日用品 · 超市', amount:59.00 },
    { wi:0, day:3, type:'expense', time:'19:30', category:'娱乐', note:'电影 · 两张票', amount:88.00 },
    { wi:0, day:4, type:'expense', time:'19:00', category:'餐饮', note:'晚餐 · 朋友小聚', amount:45.00 },
    { wi:0, day:5, type:'expense', time:'12:40', category:'餐饮', note:'周末聚餐', amount:120.00 },
    { wi:0, day:5, type:'expense', time:'21:20', category:'交通', note:'打车 · 雨天', amount:30.00 },
    { wi:0, day:6, type:'expense', time:'16:00', category:'居家', note:'绿植 · 盆栽', amount:66.00 },
    { wi:-1, day:0, type:'expense', time:'12:00', category:'餐饮', note:'午餐 · 工作餐', amount:35.00 },
    { wi:-1, day:0, type:'expense', time:'09:10', category:'交通', note:'地铁', amount:6.00 },
    { wi:-1, day:2, type:'expense', time:'10:30', category:'医疗', note:'牙医 · 洗牙', amount:120.00 },
    { wi:-1, day:4, type:'expense', time:'20:00', category:'购物', note:'耳机', amount:199.00 },
    { wi:-1, day:5, type:'expense', time:'14:00', category:'娱乐', note:'展览 · 门票', amount:60.00 },
    { wi:-1, day:6, type:'expense', time:'18:30', category:'餐饮', note:'家庭餐', amount:88.00 },
    { wi:-2, day:1, type:'expense', time:'12:20', category:'餐饮', note:'午餐 · 轻食', amount:42.00 },
    { wi:-2, day:1, type:'expense', time:'09:00', category:'交通', note:'地铁', amount:6.00 },
    { wi:-2, day:3, type:'expense', time:'19:00', category:'娱乐', note:'展览', amount:150.00 },
    { wi:-2, day:5, type:'expense', time:'15:30', category:'购物', note:'书店', amount:76.00 },
    { wi:-2, day:6, type:'expense', time:'18:40', category:'餐饮', note:'晚餐', amount:55.00 }
  ];
  const _weekBills = _billDefs.map((b, i) => ({
    id: 'b' + (i + 1),
    type: b.type,
    date: _wkDate(b.wi, b.day),
    time: b.time,
    category: b.category,
    note: b.note,
    amount: b.amount
  }));

  // 月度收支：本月 / 上月 / 上上月 各补充若干笔，让 mb7/mb6/mb5 都是真实聚合
  function _mkMonthBills(tag, i, rows) {
    const mi = _monthInfo(i);
    return rows.map((r, k) => ({
      id: `b_${tag}_${k}`,
      type: r[0], date: `${mi.y}-${_pad(mi.m + 1)}-${_pad(r[1])}`,
      time: r[2] || '12:00', category: r[3], note: r[4], amount: r[5]
    }));
  }
  const _julyExtra = _mkMonthBills('julx', 0, [
    ['expense',1,'19:00','餐饮','月初聚餐',60.00],
    ['expense',4,'10:00','购物','空调清洗',240.00],
    ['expense',9,'15:00','居家','绿植',75.00],
    ['expense',15,'20:00','娱乐','电影',90.00],
    ['income',22,'今日','工资','月薪 · 到账',18500.00]
  ]);
  const _juneBills = _mkMonthBills('jun', -1, [
    ['expense',3,'12:30','餐饮','午餐 · 工作餐',42.00],
    ['expense',5,'09:10','交通','地铁',6.00],
    ['expense',8,'20:00','购物','夏装 · T恤',159.00],
    ['expense',11,'19:20','餐饮','聚餐 · 同事',88.00],
    ['expense',14,'14:00','娱乐','展览 · 门票',60.00],
    ['expense',17,'10:00','医疗','感冒药',35.00],
    ['income',20,'今日','兼职','稿费 · 专栏',1200.00],
    ['expense',22,'16:00','居家','收纳盒',120.00],
    ['expense',25,'18:40','餐饮','周末火锅',66.00],
    ['expense',27,'21:00','交通','打车 · 雨天',30.00],
    ['expense',29,'13:00','学习','网课 · 摄影',99.00],
    ['expense',30,'19:00','购物','生日礼物',210.00]
  ]);
  const _mayBills = _mkMonthBills('may', -2, [
    ['expense',2,'12:00','餐饮','午餐 · 轻食',55.00],
    ['expense',6,'09:00','交通','地铁 · 往返',12.00],
    ['expense',9,'19:30','购物','运动鞋',320.00],
    ['expense',12,'19:00','娱乐','演唱会',180.00],
    ['expense',15,'20:00','餐饮','朋友聚餐',72.00],
    ['expense',18,'15:00','居家','香薰',88.00],
    ['income',20,'今日','兼职','稿费 · 专栏',1200.00],
    ['expense',23,'09:30','医疗','体检',60.00],
    ['expense',26,'08:20','餐饮','早餐 · 一周',40.00],
    ['expense',28,'14:00','学习','书籍 · 三本',150.00],
    ['expense',30,'21:00','购物','数码配件',99.00],
    ['expense',31,'17:00','交通','加油',18.00]
  ]);
  const _bills = _weekBills.concat(_julyExtra, _juneBills, _mayBills);

  // 周报/月报骨架：运行时由 computeWeekNoteReport / computeWeekReport / computeMonthReport 按真实日期聚合填充
  function _weekNoteReport(i) {
    const w = _wkRange(i);
    return { id: i === 0 ? 'wn30' : i === -1 ? 'wn29' : 'wn28', week: w.week, range: w.range, sd: w.sd, ed: w.ed,
      total: 0, images: 0, doodles: 0, stats: { inspiration: 0, life: 0, thought: 0, free: 0 }, categories: [], keywords: [] };
  }
  function _weekBillReport(i) {
    const w = _wkRange(i);
    return { id: i === 0 ? 'wb30' : i === -1 ? 'wb29' : 'wb28', week: w.week, range: w.range, sd: w.sd, ed: w.ed,
      expense: 0, income: 0, balance: 0, daily: [], cats: [], insight: '' };
  }
  function _monthReport(i) {
    const mi = _monthInfo(i);
    return { id: i === 0 ? 'mb7' : i === -1 ? 'mb6' : 'mb5', month: mi.label, monthKey: mi.key,
      expense: 0, income: 0, balance: 0, weeks: [], cats: [], insight: '' };
  }

  const seed = {
    notes: _notes,
    weeklyNoteReports: [ _weekNoteReport(0), _weekNoteReport(-1), _weekNoteReport(-2) ],
    bills: _bills,
    weeklyBillReports: [ _weekBillReport(0), _weekBillReport(-1), _weekBillReport(-2) ],
    monthlyBillReports: [ _monthReport(0), _monthReport(-1), _monthReport(-2) ]
  };

  // 空数据：保留报告骨架（屏3/屏4 需要按周/月导航），但手记与账单为空，
  // 用于「首次安装即无示例内容」以及「清空本地数据后恢复为空」。
  const emptyData = {
    notes: [],
    weeklyNoteReports: [ _weekNoteReport(0), _weekNoteReport(-1), _weekNoteReport(-2) ],
    bills: [],
    weeklyBillReports: [ _weekBillReport(0), _weekBillReport(-1), _weekBillReport(-2) ],
    monthlyBillReports: [ _monthReport(0), _monthReport(-1), _monthReport(-2) ]
  };


  let data = null;

  // ---------- IndexedDB 媒体层 ----------
  function openMediaDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no-indexeddb'));
      const req = indexedDB.open(MDB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('blobs'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function putMedia(blob) {
    return new Promise((resolve, reject) => {
      openMediaDB().then((db) => {
        const id = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(blob, id);
        tx.oncomplete = () => resolve(id);
        tx.onerror = () => reject(tx.error);
      }).catch(reject);
    });
  }
  function getMedia(id) {
    return new Promise((resolve, reject) => {
      openMediaDB().then((db) => {
        const tx = db.transaction('blobs', 'readonly');
        const rq = tx.objectStore('blobs').get(id);
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => reject(rq.error);
      }).catch(reject);
    });
  }
  function deleteMedia(id) {
    return new Promise((resolve) => {
      openMediaDB().then((db) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(id);
        tx.oncomplete = () => resolve();
      }).catch(() => resolve());
    });
  }
  function blobToDataURL(blob) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    });
  }
  // 保存一个媒体 Blob，返回描述符 {mediaId} 或 {src}
  function storeMedia(blob) {
    return putMedia(blob)
      .then((id) => ({ mediaId: id }))
      .catch(() => blobToDataURL(blob).then((src) => ({ src })));
  }
  // 取回媒体对象 URL（用于 <img>/背景图）
  function mediaURL(id) {
    return getMedia(id)
      .then((blob) => (blob ? URL.createObjectURL(blob) : ''))
      .catch(() => '');
  }

  // ---------- localStorage 元数据层 ----------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { data = JSON.parse(raw); return data; }
    } catch (e) { /* fall through to empty */ }
    // 首次安装：直接给空数据，不再灌入示例手记 / 账单
    data = JSON.parse(JSON.stringify(emptyData));
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    return data;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function addNote(note) {
    const n = Object.assign({ id: 'n' + Date.now(), date: _fmt(new Date()), time: '', place: '位置待授权', body: '', category: '随心记录', media: [] }, note);
    data.notes.unshift(n);
    save();
    return n;
  }

  function addBill(bill) {
    const b = Object.assign({ id: 'b' + Date.now(), date: _fmt(new Date()) }, bill);
    data.bills.unshift(b);
    save();
    return b;
  }

  function deleteBill(id) {
    data.bills = data.bills.filter((b) => b.id !== id);
    save();
  }

  function deleteNote(id) {
    data.notes = data.notes.filter((n) => n.id !== id);
    save();
  }

  function billsByMonth(monthKey) {
    return data.bills.filter((b) => (b.date || '').slice(0, 7) === monthKey);
  }

  function notesByMonth(monthKey) {
    return data.notes.filter((n) => (n.date || '').slice(0, 7) === monthKey);
  }

  function noteMonthKeys() {
    const set = new Set(data.notes.map((n) => (n.date || '').slice(0, 7)).filter(Boolean));
    return [...set].sort().reverse();
  }

  function setNoteCategory(id, category) {
    const n = data.notes.find((x) => x.id === id);
    if (n) { n.category = category; save(); }
    return n;
  }

  function updateNote(id, patch) {
    const n = data.notes.find((x) => x.id === id);
    if (n) { Object.assign(n, patch); save(); }
    return n;
  }

  function monthKeys() {
    const set = new Set(data.bills.map((b) => (b.date || '').slice(0, 7)).filter(Boolean));
    return [...set].sort().reverse();
  }

  function reset() { return clearAll(); }
  // 清空所有本地手记 / 账单 / 报告，恢复成空状态（不再灌入示例数据），并一并清空媒体文件
  function clearAll() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    data = JSON.parse(JSON.stringify(emptyData));
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    try {
      openMediaDB().then((db) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').clear();
      }).catch(() => {});
    } catch (e) {}
    return data;
  }

  // 清空所有示例手记 / 账单（保留用户资料与设置），用于「新用户首次打开即空」的需求
  function wipeSamples() {
    data.notes = [];
    data.bills = [];
    data.noteMonthCache = {};
    data.billMonthCache = {};
    save();
    return data;
  }

  function replaceData(d) { data = d; save(); }

  return {
    load, save, addNote, addBill, deleteBill, deleteNote, reset, clearAll, wipeSamples, replaceData,
    storeMedia, mediaURL, deleteMedia, billsByMonth, monthKeys, notesByMonth, noteMonthKeys,
    setNoteCategory, updateNote,
    get data() { return data; }
  };
})();
