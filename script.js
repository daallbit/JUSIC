(() => {
  'use strict';

  const STORAGE_KEY = 'vse_state_v2';
  const TICK_MS = 1500;
  const CANDLE_SIZE = 5;
  const MAX_CANDLES = 120;
  const DAY_TICKS = 40;
  const START_CASH = 10000000;
  const LOGO_COLORS = ['#e8b84b','#f0455c','#3b82f6','#5fbf8b','#c084fc','#fb923c','#22d3ee','#f472b6'];

  const DEFAULT_STOCKS = [
    { ticker: 'GLXE', name: '은하전자',   tag: '대형주', base: 84500,  vol: 0.010 },
    { ticker: 'CYBI', name: '청연바이오', tag: '소형주', base: 23100,  vol: 0.024 },
    { ticker: 'DHHI', name: '대한중공업', tag: '대형주', base: 51200,  vol: 0.006 },
    { ticker: 'PDET', name: '파도엔터',   tag: '소형주', base: 34700,  vol: 0.019 },
    { ticker: 'HSEN', name: '해솔에너지', tag: '대형주', base: 67300,  vol: 0.012 },
    { ticker: 'BBGM', name: '별빛게임즈', tag: '소형주', base: 19500,  vol: 0.017 },
  ];

  const STRENGTH_RANGE = { weak: [0.01, 0.03], mid: [0.04, 0.08], strong: [0.09, 0.16] };
  const IMPULSE_TICKS = 6;

  const fmtWon = n => Math.round(n).toLocaleString('ko-KR') + '원';
  const fmtInt = n => Math.round(n).toLocaleString('ko-KR');
  const fmtSigned = n => (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let uid = 1;

  function makeStock(def) {
    const price = def.base;
    return {
      ticker: def.ticker, name: def.name, tag: def.tag, base: def.base, vol: def.vol,
      color: LOGO_COLORS[Object.keys(def).length % LOGO_COLORS.length] || LOGO_COLORS[0],
      price, dayOpen: price,
      candles: [],
      curCandle: { o: price, h: price, l: price, c: price, v: 0, ticks: 0 },
      impulses: [],
      drawings: [],
    };
  }

  function freshState() {
    const stocks = {};
    DEFAULT_STOCKS.forEach((def, i) => {
      const s = makeStock(def);
      s.color = LOGO_COLORS[i % LOGO_COLORS.length];
      stocks[def.ticker] = s;
    });
    return {
      cash: START_CASH,
      positions: [],
      day: 1,
      tickCount: 0,
      newsLog: [],
      stocks,
      usdkrw: 1380,
      investors: 100000 + Math.floor(Math.random() * 5000),
      nospiBase: 700,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      if (!parsed.stocks || !Object.keys(parsed.stocks).length) return freshState();
      Object.values(parsed.stocks).forEach(s => {
        s.impulses = s.impulses || [];
        s.drawings = s.drawings || [];
        s.candles = s.candles || [];
        s.curCandle = s.curCandle || { o: s.price, h: s.price, l: s.price, c: s.price, v: 0, ticks: 0 };
        s.dayOpen = s.dayOpen || s.price;
      });
      parsed.positions = parsed.positions || [];
      parsed.newsLog = parsed.newsLog || [];
      parsed.usdkrw = parsed.usdkrw || 1380;
      parsed.investors = parsed.investors || 100000;
      parsed.nospiBase = parsed.nospiBase || 700;
      return parsed;
    } catch (e) { return freshState(); }
  }

  let state = loadState();
  let selectedTicker = Object.keys(state.stocks)[0];
  let toolMode = 'cursor';
  let pendingTrendPoint = null;
  let editingTicker = null;

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  const el = id => document.getElementById(id);

  // ---------- Index / FX ----------
  function computeNospi() {
    const list = Object.values(state.stocks);
    if (!list.length) return { value: state.nospiBase, change: 0 };
    const avgRatio = list.reduce((sum, s) => sum + s.price / s.base, 0) / list.length;
    const value = state.nospiBase * avgRatio;
    const avgDayRatio = list.reduce((sum, s) => sum + s.price / s.dayOpen, 0) / list.length;
    const change = (avgDayRatio - 1) * 100;
    return { value, change };
  }

  // ---------- Simulation ----------
  function tick() {
    state.tickCount++;
    if (state.tickCount % DAY_TICKS === 0) {
      state.day++;
      Object.values(state.stocks).forEach(s => { s.dayOpen = s.price; });
    }
    if (state.tickCount % 6 === 0) {
      state.usdkrw = clamp(state.usdkrw * (1 + rand(-0.0015, 0.0015)), 1100, 1700);
    }
    if (state.tickCount % 8 === 0) {
      state.investors += Math.floor(rand(0, 40));
    }

    Object.values(state.stocks).forEach(stock => {
      let impulsePct = 0;
      stock.impulses = stock.impulses.filter(imp => imp.remaining > 0);
      stock.impulses.forEach(imp => {
        const weight = imp.remaining / imp.totalTicks;
        impulsePct += imp.perTick * (0.5 + weight);
        imp.remaining--;
      });
      const drift = (Math.random() - 0.5) * stock.vol;
      const pct = drift + impulsePct;
      stock.price = Math.max(10, stock.price * (1 + pct));

      const cc = stock.curCandle;
      cc.h = Math.max(cc.h, stock.price);
      cc.l = Math.min(cc.l, stock.price);
      cc.c = stock.price;
      cc.v += Math.abs(pct) * 50000 + Math.random() * 800;
      cc.ticks++;
      if (cc.ticks >= CANDLE_SIZE) {
        stock.candles.push({ o: cc.o, h: cc.h, l: cc.l, c: cc.c, v: cc.v });
        if (stock.candles.length > MAX_CANDLES) stock.candles.shift();
        stock.curCandle = { o: stock.price, h: stock.price, l: stock.price, c: stock.price, v: 0, ticks: 0 };
      }
    });

    checkLiquidations();
    renderTopbar();
    renderCompanyList();
    renderChart();
    renderPositions();
    renderAccount();
    saveState();
  }

  // ---------- News ----------
  function publishNews(ticker, headline, body, sentiment, strength) {
    const stock = state.stocks[ticker];
    if (!stock) return;
    const [lo, hi] = STRENGTH_RANGE[strength];
    let magnitude = rand(lo, hi);
    if (sentiment === 'bad') magnitude *= -1;
    if (sentiment === 'neutral') magnitude *= rand(-0.3, 0.3);

    stock.impulses.push({ perTick: magnitude / IMPULSE_TICKS, remaining: IMPULSE_TICKS, totalTicks: IMPULSE_TICKS });

    state.newsLog.unshift({
      id: uid++, ticker, headline, body: body || '', sentiment, strength, magnitude,
      day: state.day, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    });
    if (state.newsLog.length > 50) state.newsLog.pop();
    renderNewsFeed();
    saveState();
  }

  // ---------- Positions (leveraged long/short) ----------
  function openPosition(ticker, side, qty, leverage) {
    const stock = state.stocks[ticker];
    if (!stock || qty <= 0) return '수량을 확인해주세요.';
    const notional = stock.price * qty;
    const margin = notional / leverage;
    if (margin > state.cash) return '증거금이 부족합니다.';
    state.cash -= margin;
    state.positions.push({
      id: uid++, ticker, side, qty, leverage, entryPrice: stock.price, margin,
      day: state.day, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    });
    saveState();
    return `${stock.name} ${side === 'long' ? '롱' : '숏'} ${qty}주 진입 (증거금 ${fmtWon(margin)})`;
  }

  function positionPnl(pos) {
    const stock = state.stocks[pos.ticker];
    if (!stock) return 0;
    const diff = stock.price - pos.entryPrice;
    return pos.side === 'long' ? diff * pos.qty : -diff * pos.qty;
  }

  function closePosition(id, opts = {}) {
    const idx = state.positions.findIndex(p => p.id === id);
    if (idx === -1) return;
    const pos = state.positions[idx];
    const pnl = opts.liquidated ? -pos.margin : positionPnl(pos);
    state.cash += Math.max(0, pos.margin + pnl);
    state.positions.splice(idx, 1);
    saveState();
    renderPositions();
    renderAccount();
    return pnl;
  }

  function checkLiquidations() {
    [...state.positions].forEach(pos => {
      const stock = state.stocks[pos.ticker];
      if (!stock) return;
      const liqUp = pos.entryPrice * (1 + 1 / pos.leverage);
      const liqDown = pos.entryPrice * (1 - 1 / pos.leverage);
      const liquidated = pos.side === 'long' ? stock.price <= liqDown : stock.price >= liqUp;
      if (liquidated) {
        closePosition(pos.id, { liquidated: true });
        state.newsLog.unshift({
          id: uid++, ticker: pos.ticker, headline: `${stock.name} 포지션 강제청산`,
          body: `레버리지 ${pos.leverage}x ${pos.side === 'long' ? '롱' : '숏'} 포지션이 청산가에 도달해 강제 청산되었습니다.`,
          sentiment: 'bad', strength: 'weak', magnitude: 0,
          day: state.day, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        });
        renderNewsFeed();
      }
    });
  }

  function totalAsset() {
    const posValue = state.positions.reduce((sum, p) => sum + p.margin + positionPnl(p), 0);
    return state.cash + posValue;
  }

  // ---------- Company management ----------
  function addCompany(name, ticker, tag, price) {
    ticker = ticker.toUpperCase().trim();
    if (state.stocks[ticker]) return '이미 존재하는 티커입니다.';
    const s = makeStock({ ticker, name, tag, base: price, vol: rand(0.008, 0.022) });
    s.color = LOGO_COLORS[Object.keys(state.stocks).length % LOGO_COLORS.length];
    state.stocks[ticker] = s;
    selectedTicker = ticker;
    saveState();
    return null;
  }

  function editCompany(ticker, name, tag) {
    const s = state.stocks[ticker];
    if (!s) return;
    s.name = name; s.tag = tag;
    saveState();
  }

  function deleteCompany(ticker) {
    if (Object.keys(state.stocks).length <= 1) return '최소 한 개의 기업은 남아있어야 합니다.';
    state.positions = state.positions.filter(p => p.ticker !== ticker);
    delete state.stocks[ticker];
    if (selectedTicker === ticker) selectedTicker = Object.keys(state.stocks)[0];
    saveState();
    return null;
  }

  // ---------- Canvas: candlestick chart ----------
  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  let lastChartGeom = null;

  function renderChart() {
    const stock = state.stocks[selectedTicker];
    if (!stock) return;
    const candles = [...stock.candles, stock.curCandle].filter(c => c.ticks !== 0 || stock.candles.length === 0 || c === stock.curCandle);
    const displayCandles = stock.candles.concat([stock.curCandle]);
    drawCandleChart(el('candleCanvas'), stock, displayCandles);
    drawVolumeChart(el('volumeCanvas'), displayCandles);
    renderSelectedHeader(stock);
  }

  function drawCandleChart(canvas, stock, candles) {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!candles.length) { lastChartGeom = null; return; }

    const padL = 8, padR = 60, padT = 14, padB = 14;
    const plotW = w - padL - padR, plotH = h - padT - padB;

    let min = Infinity, max = -Infinity;
    candles.forEach(c => { min = Math.min(min, c.l); max = Math.max(max, c.h); });
    stock.drawings.forEach(d => {
      if (d.type === 'h') { min = Math.min(min, d.price); max = Math.max(max, d.price); }
      if (d.type === 'trend') { min = Math.min(min, d.p1, d.p2); max = Math.max(max, d.p1, d.p2); }
    });
    if (min === max) { min *= 0.98; max *= 1.02; }
    const range = (max - min) * 1.08 || 1;
    const mid = (max + min) / 2;
    min = mid - range / 2; max = mid + range / 2;

    const n = candles.length;
    const slot = plotW / n;
    const bodyW = Math.max(2, Math.min(14, slot * 0.6));

    const toY = v => padT + plotH - ((v - min) / (max - min)) * plotH;
    const toX = i => padL + i * slot + slot / 2;

    lastChartGeom = { padL, padT, plotW, plotH, min, max, n, slot };

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = padT + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      const val = max - ((max - min) / 4) * i;
      ctx.fillStyle = '#7d8496';
      ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.fillText(fmtInt(val), padL + plotW + 6, y + 4);
    }

    // user drawings
    stock.drawings.forEach(d => {
      ctx.strokeStyle = '#e8b84b';
      ctx.setLineDash(d.type === 'h' ? [5, 4] : []);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (d.type === 'h') {
        const y = toY(d.price);
        ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y);
      } else {
        ctx.moveTo(padL + d.x1 * plotW, toY(d.p1));
        ctx.lineTo(padL + d.x2 * plotW, toY(d.p2));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // candles
    candles.forEach((c, i) => {
      const x = toX(i);
      const up = c.c >= c.o;
      const color = up ? '#f0455c' : '#3b82f6';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l));
      ctx.stroke();
      const yO = toY(c.o), yC = toY(c.c);
      const top = Math.min(yO, yC), height = Math.max(1.5, Math.abs(yO - yC));
      ctx.fillRect(x - bodyW / 2, top, bodyW, height);
    });

    // current price dashed line + tag
    const lastPrice = stock.price;
    const y = toY(lastPrice);
    ctx.strokeStyle = '#e8b84b';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8b84b';
    ctx.fillRect(padL + plotW, y - 9, padR - 4, 18);
    ctx.fillStyle = '#1a1408';
    ctx.font = 'bold 11px "IBM Plex Mono", monospace';
    ctx.fillText(fmtInt(lastPrice), padL + plotW + 4, y + 4);

    // pending trend line preview
    if (pendingTrendPoint) {
      ctx.fillStyle = '#e8b84b';
      ctx.beginPath();
      ctx.arc(padL + pendingTrendPoint.x * plotW, toY(pendingTrendPoint.price), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawVolumeChart(canvas, candles) {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!candles.length) return;
    const padL = 8, padR = 60;
    const plotW = w - padL - padR;
    const maxV = Math.max(...candles.map(c => c.v), 1);
    const n = candles.length;
    const slot = plotW / n;
    const barW = Math.max(2, Math.min(14, slot * 0.6));
    candles.forEach((c, i) => {
      const x = padL + i * slot + slot / 2;
      const barH = (c.v / maxV) * (h - 6);
      ctx.fillStyle = c.c >= c.o ? 'rgba(240,69,92,0.55)' : 'rgba(59,130,246,0.55)';
      ctx.fillRect(x - barW / 2, h - barH, barW, barH);
    });
  }

  function canvasToChart(canvas, evt) {
    if (!lastChartGeom) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left);
    const y = (evt.clientY - rect.top);
    const { padL, padT, plotW, plotH, min, max } = lastChartGeom;
    const xFrac = clamp((x - padL) / plotW, 0, 1);
    const price = max - ((y - padT) / plotH) * (max - min);
    return { x: xFrac, price };
  }

  // ---------- Rendering: top bar ----------
  function renderTopbar() {
    const { value, change } = computeNospi();
    el('nospiValue').textContent = value.toFixed(2);
    const chEl = el('nospiChange');
    chEl.textContent = fmtSigned(change);
    chEl.style.color = change > 0 ? 'var(--up)' : change < 0 ? 'var(--down)' : 'var(--text-muted)';
    el('usdkrwValue').textContent = state.usdkrw.toFixed(1);
    el('investorValue').textContent = fmtInt(state.investors);
  }

  function tickClock() {
    const now = new Date();
    el('clockValue').textContent = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ---------- Rendering: company list ----------
  function renderCompanyList() {
    const list = el('companyList');
    list.innerHTML = '';
    Object.values(state.stocks).forEach(stock => {
      const changePct = ((stock.price - stock.dayOpen) / stock.dayOpen) * 100;
      const dir = changePct > 0.001 ? 'up' : changePct < -0.001 ? 'down' : 'flat';
      const row = document.createElement('div');
      row.className = 'company-row' + (stock.ticker === selectedTicker ? ' is-selected' : '');
      row.innerHTML = `
        <div class="company-logo" style="background:${stock.color}">${stock.name.charAt(0)}</div>
        <div class="company-info">
          <div class="company-name">${stock.name}</div>
          <div class="company-meta"><span>${stock.ticker}</span><span class="tag-pill">${stock.tag}</span></div>
        </div>
        <div class="company-price">
          <span class="cp-val mono">${fmtInt(stock.price)}</span>
          <span class="cp-chg mono change-${dir}" style="color:${dir === 'up' ? 'var(--up)' : dir === 'down' ? 'var(--down)' : 'var(--text-muted)'}">${fmtSigned(changePct)}</span>
        </div>
      `;
      row.addEventListener('click', () => { selectedTicker = stock.ticker; toolMode = 'cursor'; setActiveTool('cursor'); pendingTrendPoint = null; renderCompanyList(); renderChart(); renderNewsStockOptions(); });
      list.appendChild(row);
    });
  }

  function renderSelectedHeader(stock) {
    el('selName').textContent = stock.name;
    el('selTicker').textContent = stock.ticker;
    el('selTag').textContent = stock.tag;
    el('selPrice').textContent = fmtInt(stock.price);
    const changePct = ((stock.price - stock.dayOpen) / stock.dayOpen) * 100;
    const chEl = el('selChange');
    chEl.textContent = fmtSigned(changePct);
    chEl.style.color = changePct > 0 ? 'var(--up)' : changePct < 0 ? 'var(--down)' : 'var(--text-muted)';
    const notional = stock.price * (parseInt(el('tradeQty').value, 10) || 0);
    const lev = parseInt(el('tradeLev').value, 10) || 1;
    el('marginPreview').textContent = fmtWon(notional / lev);
  }

  // ---------- Rendering: positions / account ----------
  function renderPositions() {
    const list = el('positionList');
    if (!state.positions.length) {
      list.innerHTML = '<p class="empty-msg">보유 포지션 없음</p>';
    } else {
      list.innerHTML = state.positions.map(pos => {
        const stock = state.stocks[pos.ticker];
        if (!stock) return '';
        const pnl = positionPnl(pos);
        const roi = (pnl / pos.margin) * 100;
        return `<div class="position-item">
          <div class="p-top">
            <span class="p-name">${stock.name}</span>
            <span class="p-side ${pos.side}">${pos.side === 'long' ? '롱' : '숏'} ${pos.leverage}x</span>
          </div>
          <div class="p-meta">${pos.qty}주 · 진입가 ${fmtInt(pos.entryPrice)} · 증거금 ${fmtWon(pos.margin)}</div>
          <div class="p-bottom">
            <span class="p-pnl" style="color:${pnl >= 0 ? 'var(--up)' : 'var(--down)'}">${pnl >= 0 ? '+' : ''}${fmtInt(pnl)}원 (${fmtSigned(roi)})</span>
            <button class="p-close" data-id="${pos.id}">청산</button>
          </div>
        </div>`;
      }).join('');
      list.querySelectorAll('.p-close').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id, 10);
          const pnl = closePosition(id);
          el('tradeMsg').textContent = `포지션 청산 완료 (${pnl >= 0 ? '+' : ''}${fmtInt(pnl)}원)`;
        });
      });
    }
  }

  function renderAccount() {
    el('cashValue').textContent = fmtWon(state.cash);
    el('totalAssetTag').textContent = fmtWon(totalAsset());
  }

  // ---------- Rendering: news feed ----------
  function renderNewsFeed() {
    const feed = el('newsFeed');
    if (!state.newsLog.length) {
      feed.innerHTML = '<p class="empty-msg">발행된 뉴스가 없습니다.</p>';
      return;
    }
    feed.innerHTML = state.newsLog.slice(0, 30).map(n => {
      const stock = state.stocks[n.ticker];
      const tagClass = n.sentiment === 'good' ? 'good' : n.sentiment === 'bad' ? 'bad' : 'neutral';
      const tagText = n.sentiment === 'good' ? '호재' : n.sentiment === 'bad' ? '악재' : '중립';
      const magTxt = n.magnitude ? fmtSigned(n.magnitude * 100) : '';
      return `<div class="news-item">
        <div class="n-top">
          <span class="n-tag ${tagClass}">${tagText}</span>
          ${magTxt ? `<span class="n-magnitude ${tagClass}">${magTxt}</span>` : ''}
        </div>
        <div class="n-head">${stock ? stock.name : n.ticker} · ${n.headline}</div>
        ${n.body ? `<div class="n-body">${n.body}</div>` : ''}
        <div class="n-meta">Day ${n.day} ${n.time}</div>
      </div>`;
    }).join('');
  }

  function renderNewsStockOptions() {
    const select = el('newsStock');
    select.innerHTML = Object.values(state.stocks).map(s => `<option value="${s.ticker}">${s.name} (${s.ticker})</option>`).join('');
    select.value = selectedTicker;
  }

  function renderAll() {
    renderTopbar();
    tickClock();
    renderCompanyList();
    renderChart();
    renderPositions();
    renderAccount();
    renderNewsFeed();
    renderNewsStockOptions();
  }

  // ---------- Modals ----------
  function openCompanyModal(mode) {
    const backdrop = el('companyModalBackdrop');
    const priceField = el('cfPriceField');
    const delBtn = el('cfDelete');
    if (mode === 'new') {
      editingTicker = null;
      el('companyModalTitle').textContent = '신규 기업 등록';
      el('cfName').value = ''; el('cfTicker').value = ''; el('cfTag').value = '소형주'; el('cfPrice').value = 10000;
      el('cfTicker').disabled = false;
      priceField.style.display = '';
      delBtn.style.display = 'none';
    } else {
      const stock = state.stocks[selectedTicker];
      editingTicker = selectedTicker;
      el('companyModalTitle').textContent = '기업 정보 수정';
      el('cfName').value = stock.name; el('cfTicker').value = stock.ticker; el('cfTag').value = stock.tag;
      el('cfTicker').disabled = true;
      priceField.style.display = 'none';
      delBtn.style.display = Object.keys(state.stocks).length > 1 ? '' : 'none';
    }
    backdrop.classList.add('is-open');
  }
  function closeCompanyModal() { el('companyModalBackdrop').classList.remove('is-open'); }

  function openNewsModal() {
    renderNewsStockOptions();
    el('newsModalBackdrop').classList.add('is-open');
  }
  function closeNewsModal() { el('newsModalBackdrop').classList.remove('is-open'); }

  // ---------- Tools ----------
  function setActiveTool(tool) {
    toolMode = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.tool === tool));
    pendingTrendPoint = null;
  }

  // ---------- Init ----------
  function init() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
    });

    el('btnClearDraw').addEventListener('click', () => {
      const stock = state.stocks[selectedTicker];
      stock.drawings = [];
      saveState();
      renderChart();
    });

    const candleCanvas = el('candleCanvas');
    candleCanvas.addEventListener('click', evt => {
      const stock = state.stocks[selectedTicker];
      const pt = canvasToChart(candleCanvas, evt);
      if (!pt) return;
      if (toolMode === 'horizontal') {
        stock.drawings.push({ type: 'h', price: pt.price });
        saveState(); renderChart();
      } else if (toolMode === 'trend') {
        if (!pendingTrendPoint) {
          pendingTrendPoint = pt;
          renderChart();
        } else {
          stock.drawings.push({ type: 'trend', x1: pendingTrendPoint.x, p1: pendingTrendPoint.price, x2: pt.x, p2: pt.price });
          pendingTrendPoint = null;
          saveState(); renderChart();
        }
      }
    });

    el('tradeQty').addEventListener('input', () => renderSelectedHeader(state.stocks[selectedTicker]));
    el('tradeLev').addEventListener('change', () => renderSelectedHeader(state.stocks[selectedTicker]));

    el('btnLong').addEventListener('click', () => {
      const qty = parseInt(el('tradeQty').value, 10) || 0;
      const lev = parseInt(el('tradeLev').value, 10) || 1;
      const msg = openPosition(selectedTicker, 'long', qty, lev);
      el('tradeMsg').textContent = msg;
      renderPositions(); renderAccount();
    });
    el('btnShort').addEventListener('click', () => {
      const qty = parseInt(el('tradeQty').value, 10) || 0;
      const lev = parseInt(el('tradeLev').value, 10) || 1;
      const msg = openPosition(selectedTicker, 'short', qty, lev);
      el('tradeMsg').textContent = msg;
      renderPositions(); renderAccount();
    });

    // Company modal
    el('btnNewCompany').addEventListener('click', () => openCompanyModal('new'));
    el('btnEditCompany').addEventListener('click', () => openCompanyModal('edit'));
    el('cfCancel').addEventListener('click', closeCompanyModal);
    el('companyModalBackdrop').addEventListener('click', e => { if (e.target.id === 'companyModalBackdrop') closeCompanyModal(); });
    el('companyForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = el('cfName').value.trim();
      const tickerVal = el('cfTicker').value.trim();
      const tag = el('cfTag').value;
      if (editingTicker) {
        editCompany(editingTicker, name, tag);
      } else {
        const price = parseFloat(el('cfPrice').value) || 10000;
        const errMsg = addCompany(name, tickerVal, tag, price);
        if (errMsg) { alert(errMsg); return; }
      }
      closeCompanyModal();
      renderAll();
    });
    el('cfDelete').addEventListener('click', () => {
      if (!editingTicker) return;
      if (!confirm('이 기업을 삭제할까요? 관련 포지션도 함께 정리됩니다.')) return;
      const errMsg = deleteCompany(editingTicker);
      if (errMsg) { alert(errMsg); return; }
      closeCompanyModal();
      renderAll();
    });

    // News modal
    let sentimentVal = 'neutral', strengthVal = 'mid';
    el('btnNewNews').addEventListener('click', openNewsModal);
    el('newsCancel').addEventListener('click', closeNewsModal);
    el('newsModalBackdrop').addEventListener('click', e => { if (e.target.id === 'newsModalBackdrop') closeNewsModal(); });
    document.querySelectorAll('#sentimentSeg .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#sentimentSeg .seg-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active'); sentimentVal = btn.dataset.val;
      });
    });
    document.querySelectorAll('#strengthSeg .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#strengthSeg .seg-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active'); strengthVal = btn.dataset.val;
      });
    });
    el('newsForm').addEventListener('submit', e => {
      e.preventDefault();
      const ticker = el('newsStock').value;
      const headline = el('newsHeadline').value.trim();
      const body = el('newsBody').value.trim();
      if (!headline) return;
      publishNews(ticker, headline, body, sentimentVal, strengthVal);
      el('newsHeadline').value = ''; el('newsBody').value = '';
      closeNewsModal();
    });

    el('btnReset').addEventListener('click', () => {
      if (!confirm('모든 진행 상황을 초기화할까요?')) return;
      state = freshState();
      selectedTicker = Object.keys(state.stocks)[0];
      saveState();
      renderAll();
    });

    window.addEventListener('resize', renderChart);

    renderAll();
    setInterval(tick, TICK_MS);
    setInterval(tickClock, 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
