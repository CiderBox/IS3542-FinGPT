const API_BASE = "http://127.0.0.1:8000";

// --- Global State ---
let userProfile = {
    goal: "Growth",
    risk: "Moderate",
    horizon: "Medium Term"
};
let marketSnapshot = [];
let paperPortfolio = {
    balance: 100000.00,
    buyingPower: 100000.00,
    positions: {} 
};

// Market Engine (Simulated Live Data)
const MarketEngine = {
    stocks: {}, // { "AAPL": { price, change, history: [], dailyHistory: [] } }
    isRunning: false,
    interval: null,
    
    init(symbols) {
        symbols.forEach(sym => {
            // Init with a random base price if not exists
            if (!this.stocks[sym]) {
                const base = (Math.random() * 100 + 50).toFixed(2);
                this.stocks[sym] = {
                    price: parseFloat(base),
                    change: 0,
                    // Intraday: 60 minutes
                    history: this.generateHistory(parseFloat(base), 60, 'intraday'),
                    // Daily: 30 days
                    dailyHistory: this.generateHistory(parseFloat(base), 30, 'daily')
                };
            }
        });
        this.start();
    },

    generateHistory(basePrice, count, mode='intraday') {
        let history = [];
        let current = basePrice * (mode === 'daily' ? 0.8 : 1); // Start slightly lower for trend
        const volFactor = mode === 'daily' ? 0.03 : 0.003; // Daily moves more
        const timeStep = mode === 'daily' ? 86400000 : 60000;

        for(let i=0; i<count; i++) {
            const volatility = current * volFactor;
            const change = (Math.random() - 0.45) * volatility; // Slight upward bias
            const open = current;
            const close = current + change;
            const high = Math.max(open, close) + Math.random() * volatility * 0.5;
            const low = Math.min(open, close) - Math.random() * volatility * 0.5;
            
            history.push({ 
                time: Date.now() - (count - i) * timeStep, 
                open, high, low, close 
            });
            current = close;
        }
        // For intraday, align the last close with current basePrice
        if (mode === 'intraday' && history.length > 0) {
            const diff = basePrice - history[history.length-1].close;
            history = history.map(h => ({
                ...h,
                open: h.open + diff,
                high: h.high + diff,
                low: h.low + diff,
                close: h.close + diff
            }));
        }
        return history;
    },

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.interval = setInterval(() => {
            this.tick();
        }, 800); // 800ms tick for faster action
    },

    tick() {
        Object.keys(this.stocks).forEach(sym => {
            const stock = this.stocks[sym];
            // More volatility for live tick
            const volatility = stock.price * 0.0015; 
            const delta = (Math.random() - 0.48) * volatility; 
            
            stock.price += delta;
            stock.change = (delta / (stock.price - delta)) * 100;
            
            // Update Intraday History (Live Candle)
            const lastCandle = stock.history[stock.history.length - 1];
            if (lastCandle) {
                lastCandle.close = stock.price;
                if (stock.price > lastCandle.high) lastCandle.high = stock.price;
                if (stock.price < lastCandle.low) lastCandle.low = stock.price;
            }
        });
        
        // Dispatch event
        document.dispatchEvent(new CustomEvent('market-tick'));
    }
};

// Custom Lightweight Candle Chart
class CandleChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.chartType = 'candle'; // 'candle' or 'line'
        this.padding = { top: 20, right: 50, bottom: 30, left: 10 };
        this.resize();
    }

    setData(data, type = 'candle') {
        this.data = data;
        this.chartType = type;
        this.draw();
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const dpr = window.devicePixelRatio || 1;
        if (this.canvas.width !== rect.width * dpr || this.canvas.height !== rect.height * dpr) {
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.ctx.scale(dpr, dpr);
        }
        this.width = rect.width;
        this.height = rect.height;
        return true;
    }

    draw() {
        if (!this.resize()) return;

        this.ctx.clearRect(0, 0, this.width, this.height);
        if (!this.data || this.data.length < 2) return;

        // Calculate Scale
        let min = Infinity, max = -Infinity;
        const visibleCount = Math.min(this.data.length, 60); 
        const visibleData = this.data.slice(-visibleCount);
        
        visibleData.forEach(d => {
            // For line chart, we care mostly about close, but for scale stick to low/high
            if (d.low < min) min = d.low;
            if (d.high > max) max = d.high;
        });
        
        const range = max - min;
        const buffer = range * 0.1; 
        min -= buffer;
        max += buffer;
        
        const stepX = (this.width - this.padding.right - this.padding.left) / (visibleData.length - 1);
        const scaleY = (this.height - this.padding.top - this.padding.bottom) / (max - min);

        // Draw Grid
        this.ctx.strokeStyle = 'rgba(255,255,255,0.05)'; 
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for(let i=0; i<=5; i++) {
            const y = this.padding.top + (this.height - this.padding.top - this.padding.bottom) * (i/5);
            this.ctx.moveTo(this.padding.left, y);
            this.ctx.lineTo(this.width - this.padding.right, y);
        }
        this.ctx.stroke();

        if (this.chartType === 'line') {
            // === DRAW LINE CHART ===
            const startPrice = visibleData[0].close;
            const endPrice = visibleData[visibleData.length-1].close;
            const isUp = endPrice >= startPrice;
            const color = isUp ? '#22c55e' : '#ef4444';
            
            this.ctx.beginPath();
            visibleData.forEach((d, i) => {
                const x = this.padding.left + i * stepX;
                const y = this.padding.top + (max - d.close) * scaleY;
                if (i===0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            });
            
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Gradient Fill
            this.ctx.lineTo(this.padding.left + (visibleData.length - 1) * stepX, this.height - this.padding.bottom);
            this.ctx.lineTo(this.padding.left, this.height - this.padding.bottom);
            this.ctx.closePath();
            const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
            gradient.addColorStop(0, isUp ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            this.ctx.fillStyle = gradient;
            this.ctx.fill();

        } else {
            // === DRAW CANDLE CHART ===
            const candleWidth = (this.width - this.padding.right - this.padding.left) / visibleData.length;
            
            visibleData.forEach((d, i) => {
                const x = this.padding.left + i * candleWidth + candleWidth * 0.1;
                const yOpen = this.padding.top + (max - d.open) * scaleY;
                const yClose = this.padding.top + (max - d.close) * scaleY;
                const yHigh = this.padding.top + (max - d.high) * scaleY;
                const yLow = this.padding.top + (max - d.low) * scaleY;
                
                const isUp = d.close >= d.open;
                const color = isUp ? '#22c55e' : '#ef4444';
                
                this.ctx.fillStyle = color;
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 1;
                
                // Wick
                this.ctx.beginPath();
                this.ctx.moveTo(x + candleWidth*0.4, yHigh);
                this.ctx.lineTo(x + candleWidth*0.4, yLow);
                this.ctx.stroke();
                
                // Body
                const height = Math.max(1, Math.abs(yOpen - yClose));
                const yRect = Math.min(yOpen, yClose);
                this.ctx.fillRect(x, yRect, candleWidth * 0.8, height);
            });
        }

        // Draw Price Axis
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.font = '10px JetBrains Mono';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        for(let i=0; i<=5; i++) {
            const price = min + ((max-min) * (1 - i/5));
            const y = this.padding.top + (this.height - this.padding.top - this.padding.bottom) * (i/5);
            this.ctx.fillText(price.toFixed(2), this.width - 40, y);
        }
    }
}

let chartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    bindFlowNavigation();
    bindAppNavigation();
    bindChatInterface();
    bindTradingInterface();
    bindModals();
    bindSettingsInterface();
    bindChartToggle(); // New
    
    // Init Data
    fetchMarketOverview().then(() => {
        // Start simulated market after data load
        let symbols = marketSnapshot.map(s => s.symbol);
        
        // Fallback if no data (e.g. backend offline or empty)
        if (symbols.length === 0) {
            symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT']; 
            // Fake snapshot for UI consistency
            marketSnapshot = symbols.map(s => ({ 
                symbol: s, 
                pct_change: (Math.random()*4 - 2), 
                last_close: (Math.random()*200 + 100) 
            }));
            populateSymbolSelects();
            updateTickerTape();
        }

        MarketEngine.init(symbols);
        
        // Init Chart
        chartInstance = new CandleChart('financial-chart');
        
        // Listen for ticks
        document.addEventListener('market-tick', onMarketTick);
    });
});

function bindChartToggle() {
    const radios = document.querySelectorAll('input[name="chart-mode"]');
    radios.forEach(r => {
        r.addEventListener('change', () => {
            onMarketTick(); // Force update
        });
    });
}

function onMarketTick() {
    // Update UI for active view
    const currentSym = document.getElementById('chart-symbol-select').value;
    if (!currentSym || !MarketEngine.stocks[currentSym]) return;
    
    const stock = MarketEngine.stocks[currentSym];
    
    // 1. Update Header
    document.getElementById('live-price-display').textContent = stock.price.toFixed(2);
    const sign = stock.change >= 0 ? '+' : '';
    const colorClass = stock.change >= 0 ? 'text-success' : 'text-danger';
    const changeEl = document.getElementById('live-change-display');
    changeEl.className = `small fw-semibold font-mono ${colorClass}`;
    changeEl.textContent = `${sign}${stock.change.toFixed(2)}%`;
    
    // 2. Redraw Chart based on mode
    if (chartInstance) {
        const mode = document.querySelector('input[name="chart-mode"]:checked').value;
        if (mode === 'daily') {
            chartInstance.setData(stock.dailyHistory, 'line');
        } else {
            chartInstance.setData(stock.history, 'candle');
        }
    }
    
    // 3. Update Order Book
    updateOrderBook(stock.price);
    
    // 4. Update Portfolio P&L Real-time
    updatePortfolioUI();
}

function updateOrderBook(centerPrice) {
    const asksBody = document.getElementById('order-book-asks');
    const bidsBody = document.getElementById('order-book-bids');
    
    // Generate synthetic depth - Faster volatility
    let asks = '', bids = '';
    for(let i=5; i>=1; i--) {
        // Wider spread for realism
        const p = centerPrice + i * 0.04 + Math.random() * 0.02; 
        const s = Math.floor(Math.random() * 800) + 50;
        asks += `<tr><td class="text-muted">${s}</td><td>${p.toFixed(2)}</td></tr>`;
    }
    for(let i=1; i<=5; i++) {
        const p = centerPrice - i * 0.04 - Math.random() * 0.02;
        const s = Math.floor(Math.random() * 800) + 50;
        bids += `<tr><td class="text-muted">${s}</td><td>${p.toFixed(2)}</td></tr>`;
    }
    
    asksBody.innerHTML = asks;
    bidsBody.innerHTML = bids;
}

// ... (Rest of the file remains unchanged, copying for safety)
/* ==========================================================================
   Navigation & Core Logic (Preserved)
   ========================================================================== */
function bindFlowNavigation() {
    const showView = (id) => {
        document.querySelectorAll('.full-screen-view, .app-container').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('active');
        });
        const target = document.getElementById(id);
        target.style.display = 'flex';
        void target.offsetWidth; 
        target.classList.add('active');
    };

    document.getElementById('btn-landing-start').addEventListener('click', () => showView('view-auth'));
    document.getElementById('auth-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = e.target.querySelector('input[type="email"]').value;
        document.getElementById('user-email-display').textContent = email.split('@')[0];
        showView('view-onboarding');
    });
    document.getElementById('survey-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const goal = document.querySelector('input[name="goal"]:checked').value;
        const riskVal = document.getElementById('risk-range').value;
        const riskMap = {1: "Very Conservative", 2: "Conservative", 3: "Moderate", 4: "Aggressive", 5: "Very Aggressive"};
        userProfile = {
            goal: goal,
            risk: riskMap[riskVal] || "Moderate",
            horizon: document.getElementById('horizon-select').value
        };
        document.getElementById('profile-badge').textContent = userProfile.goal;
        document.getElementById('setting-goal-display').textContent = userProfile.goal;
        document.getElementById('setting-risk-display').textContent = userProfile.risk;
        showView('view-app');
        if (marketSnapshot.length > 0) {
            updateTickerTape();
        }
    });
    document.getElementById('btn-reset-profile').addEventListener('click', () => {
        if (confirm("Reset profile and return to start?")) showView('view-landing');
    });
}

function bindAppNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            // FIX: Force chart resize/redraw when switching to trading tab
            if (targetId === 'section-trading' && chartInstance) {
                setTimeout(() => chartInstance.draw(), 50);
            }
        });
    });
}

function bindChatInterface() {
    document.querySelectorAll('.smart-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('query').value = btn.getAttribute('data-prompt');
            document.getElementById('analysis-form').dispatchEvent(new Event('submit'));
        });
    });
    document.getElementById('btn-export-chat').addEventListener('click', () => {
        alert("Exporting analysis report..."); // Placeholder
    });
    document.getElementById('analysis-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = document.getElementById('query').value.trim();
        if (!query) return;
        appendMessage('user', query);
        document.getElementById('query').value = '';
        const loadingId = appendMessage('bot', '<div class="spinner-border spinner-border-sm text-primary" role="status"></div> Analyzing...');
        
        try {
            const res = await fetch(`${API_BASE}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, user_profile: `Goal: ${userProfile.goal}`, task: "general" })
            });
            const data = await res.json();
            updateMessage(loadingId, data.result);
            renderSources(data.sources);
            document.getElementById('btn-export-chat').style.display = 'inline-block';
        } catch (err) {
            updateMessage(loadingId, "Error: " + err.message);
        }
    });
}

function appendMessage(sender, html) {
    const area = document.getElementById('chat-scroll-area');
    const id = 'msg-' + Date.now();
    const div = document.createElement('div');
    div.className = `chat-message ${sender}`;
    div.id = id;
    div.innerHTML = `<div class="avatar">${sender==='bot'?'AI':'You'}</div><div class="content">${html}</div>`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
    return id;
}
function updateMessage(id, html) {
    const el = document.getElementById(id);
    if (el) el.querySelector('.content').innerHTML = html.replace(/\n/g, '<br>');
}
function renderSources(sources) {
    const list = document.getElementById('sources-list');
    if (!sources || !sources.length) {
        list.innerHTML = '<div class="text-center text-muted small py-4">No sources.</div>';
        return;
    }

    const accId = 'acc-' + Date.now(); // Unique ID per render
    
    list.innerHTML = `
    <div class="accordion accordion-flush" id="${accId}">
        ${sources.map((s, i) => {
            const headId = `head-${accId}-${i}`;
            const bodyId = `body-${accId}-${i}`;
            const content = s.snippet || s.content || 'No content available';
            const sourceLabel = s.source || 'DATA';
            
            return `
            <div class="accordion-item bg-transparent border-0 mb-2">
                <h2 class="accordion-header" id="${headId}">
                    <button class="accordion-button collapsed bg-light rounded-3 shadow-sm py-2 px-3 small" type="button" data-bs-toggle="collapse" data-bs-target="#${bodyId}" aria-expanded="false" aria-controls="${bodyId}">
                        <div class="d-flex align-items-center gap-2 w-100 overflow-hidden">
                            <span class="badge bg-secondary rounded-pill flex-shrink-0" style="font-size:0.65rem">${sourceLabel}</span>
                            <span class="text-truncate text-secondary small mb-0" style="max-width: 180px;">${content}</span>
                        </div>
        </button>
      </h2>
                <div id="${bodyId}" class="accordion-collapse collapse" aria-labelledby="${headId}" data-bs-parent="#${accId}">
                    <div class="accordion-body bg-white border border-top-0 rounded-bottom-3 small text-muted pt-2 pb-3">
                        ${content}
        </div>
      </div>
            </div>`;
        }).join('')}
    </div>`;
}

// --- Trading & Ticker ---
async function fetchMarketOverview() {
    try {
        const res = await fetch(`${API_BASE}/market_overview`);
        const data = await res.json();
        marketSnapshot = data.symbols || [];
        if (marketSnapshot.length > 0) {
            updateTickerTape();
            populateSymbolSelects();
            // Override MarketEngine start prices with real data if available
            marketSnapshot.forEach(s => {
                if (MarketEngine.stocks[s.symbol]) {
                    MarketEngine.stocks[s.symbol].price = s.last_close;
                    // Also regenerate Intraday history to match this real price
                    MarketEngine.stocks[s.symbol].history = MarketEngine.generateHistory(s.last_close, 60, 'intraday');
                    MarketEngine.stocks[s.symbol].dailyHistory = MarketEngine.generateHistory(s.last_close, 30, 'daily');
                }
            });
        }
    } catch (e) {}
}

function updateTickerTape() {
    const container = document.getElementById('ticker-content');
    if (!marketSnapshot.length) return;
    const items = marketSnapshot.map(s => {
        const color = s.pct_change >= 0 ? 'ticker-up' : 'ticker-down';
        return `<span class="ticker-item">${s.symbol} <span class="${color}">${s.pct_change>=0?'+':''}${s.pct_change.toFixed(2)}%</span></span>`;
    }).join('');
    container.innerHTML = items + items;
}

function populateSymbolSelects() {
    const select = document.getElementById('chart-symbol-select');
    select.innerHTML = marketSnapshot.map(s => `<option value="${s.symbol}">${s.symbol}</option>`).join('');
    select.addEventListener('change', (e) => {
        // Chart will update on next tick
        document.getElementById('order-symbol').value = e.target.value;
        onMarketTick(); // update immediately
    });
    // Trigger initial
    if (marketSnapshot.length) {
        select.value = marketSnapshot[0].symbol;
        document.getElementById('order-symbol').value = marketSnapshot[0].symbol;
    }
}

function bindTradingInterface() {
    document.getElementById('trading-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const symbol = document.getElementById('order-symbol').value;
        const side = document.querySelector('input[name="order-side"]:checked').value;
        const qty = parseInt(document.getElementById('order-qty').value);
        const price = MarketEngine.stocks[symbol].price;
        
        if (side === 'buy') {
            const total = price * qty;
            if (paperPortfolio.buyingPower >= total) {
                paperPortfolio.buyingPower -= total;
                if (!paperPortfolio.positions[symbol]) paperPortfolio.positions[symbol] = { shares: 0, cost: 0 };
                const pos = paperPortfolio.positions[symbol];
                pos.cost = (pos.shares * pos.cost + total) / (pos.shares + qty);
                pos.shares += qty;
                document.getElementById('trade-feedback').innerHTML = `<span class="text-success">Bought ${qty} ${symbol} @ ${price.toFixed(2)}</span>`;
            } else {
                document.getElementById('trade-feedback').innerHTML = `<span class="text-danger">Insufficient Funds</span>`;
            }
        } else {
            if (paperPortfolio.positions[symbol] && paperPortfolio.positions[symbol].shares >= qty) {
                const total = price * qty;
                paperPortfolio.buyingPower += total;
                paperPortfolio.positions[symbol].shares -= qty;
                if (paperPortfolio.positions[symbol].shares === 0) delete paperPortfolio.positions[symbol];
                document.getElementById('trade-feedback').innerHTML = `<span class="text-success">Sold ${qty} ${symbol} @ ${price.toFixed(2)}</span>`;
            } else {
                document.getElementById('trade-feedback').innerHTML = `<span class="text-danger">Insufficient Shares</span>`;
            }
        }
        updatePortfolioUI();
    });

    document.getElementById('btn-ai-diagnose').addEventListener('click', () => {
        document.querySelector('.nav-item[data-target="section-analysis"]').click();
        document.getElementById('query').value = "Diagnose my portfolio risks given current market volatility.";
        document.getElementById('analysis-form').dispatchEvent(new Event('submit'));
    });
}

function updatePortfolioUI() {
    let equity = paperPortfolio.buyingPower;
    let dayPnl = 0;
    Object.keys(paperPortfolio.positions).forEach(sym => {
        const pos = paperPortfolio.positions[sym];
        const current = MarketEngine.stocks[sym].price;
        const val = pos.shares * current;
        equity += val;
        dayPnl += (current - pos.cost) * pos.shares;
    });
    
    document.getElementById('equity-val').textContent = '$' + equity.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('buying-power-val').textContent = '$' + paperPortfolio.buyingPower.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('pnl-val').textContent = (dayPnl>=0?'+':'') + '$' + dayPnl.toLocaleString(undefined, {minimumFractionDigits: 2});
    
    const tbody = document.getElementById('portfolio-list-body');
    if (Object.keys(paperPortfolio.positions).length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">No positions</td></tr>';
    } else {
        tbody.innerHTML = Object.keys(paperPortfolio.positions).map(sym => {
            const pos = paperPortfolio.positions[sym];
            const current = MarketEngine.stocks[sym].price;
            const pnl = (current - pos.cost) * pos.shares;
            const color = pnl >= 0 ? 'text-success' : 'text-danger';
            return `<tr>
                <td class="ps-3 font-mono fw-bold">${sym}</td>
                <td class="text-center font-mono">${pos.shares}</td>
                <td class="text-end pe-3 font-mono ${color}">${pnl>=0?'+':''}${pnl.toFixed(2)}</td>
            </tr>`;
        }).join('');
    }
}

function bindModals() {
    const postCard = document.getElementById('post-card-1');
    if (postCard) postCard.addEventListener('click', () => new bootstrap.Modal(document.getElementById('modal-post-detail')).show());
    const kbCard = document.getElementById('kb-card-1');
    if (kbCard) kbCard.addEventListener('click', (e) => {
        if(e.target.tagName !== 'BUTTON') new bootstrap.Modal(document.getElementById('modal-article-detail')).show();
    });
    const readBtn = kbCard ? kbCard.querySelector('button') : null;
    if(readBtn) readBtn.addEventListener('click', () => new bootstrap.Modal(document.getElementById('modal-article-detail')).show());
}

function bindSettingsInterface() {}
