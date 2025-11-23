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

// Community Posts Data (Simulated DB)
let communityPosts = [
    {
        id: 1,
        author: "TraderSarah",
        badge: "Pro",
        avatarColor: "bg-primary",
        initials: "TS",
        time: "2 hours ago",
        category: "Analysis",
        catColor: "success",
        title: "Just used the AI diagnosis on my Tech portfolio",
        content: "I was heavy on NVDA and AMD, and FinGPT suggested balancing with some defensive healthcare stocks. The reasoning was spot on regarding sector rotation risks. Has anyone else tried the new risk assessment feature?",
        likes: 142,
        comments: 34
    },
    {
        id: 2,
        author: "Mike_Quant",
        badge: "",
        avatarColor: "bg-warning",
        initials: "MQ",
        time: "5 hours ago",
        category: "Question",
        catColor: "warning",
        title: "RAG Data Latency?",
        content: "Does anyone know how often the local vector database updates if I'm running the fetch script on a cron job? I'm trying to get near-real-time news sentiment integration.",
        likes: 28,
        comments: 12
    },
    {
        id: 3,
        author: "CryptoKing",
        badge: "Newbie",
        avatarColor: "bg-info",
        initials: "CK",
        time: "1 day ago",
        category: "Discussion",
        catColor: "info",
        title: "Bitcoin vs. Gold in 2025",
        content: "With the current macro environment, I'm seeing a decoupling of BTC from traditional risk assets. FinGPT's correlation matrix shows a -0.2 with SPX this month. Thoughts?",
        likes: 89,
        comments: 56
    },
    {
        id: 4,
        author: "ValueVulture",
        badge: "Analyst",
        avatarColor: "bg-danger",
        initials: "VV",
        time: "1 day ago",
        category: "Analysis",
        catColor: "success",
        title: "Deep dive into bank stocks",
        content: "JPM and BAC look undervalued based on P/B ratios relative to historical averages. The yield curve steepening should help their NIM. FinGPT confirmed my thesis with its latest report summary.",
        likes: 210,
        comments: 45
    },
    {
        id: 5,
        author: "AlgoTrader_X",
        badge: "Pro",
        avatarColor: "bg-dark",
        initials: "AX",
        time: "2 days ago",
        category: "News",
        catColor: "primary",
        title: "Fed Meeting Minutes Released",
        content: "Hawkish pause seems to be the consensus. Market is pricing in one more hike before year end. Volatility index (VIX) is spiking. Be careful with leverage this week.",
        likes: 356,
        comments: 92
    },
    {
        id: 6,
        author: "GreenEnergyFan",
        badge: "",
        avatarColor: "bg-success",
        initials: "GE",
        time: "2 days ago",
        category: "Discussion",
        catColor: "info",
        title: "Solar sector bottoming out?",
        content: "ENPH and SEDG have been hammered, but RSI is showing oversold divergence on the weekly. Is it time to start accumulating or catching a falling knife?",
        likes: 45,
        comments: 18
    }
];

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

    generateHistory(basePrice, count, mode = 'intraday') {
        let history = [];
        let current = basePrice * (mode === 'daily' ? 0.8 : 1); // Start slightly lower for trend
        const volFactor = mode === 'daily' ? 0.03 : 0.003; // Daily moves more
        const timeStep = mode === 'daily' ? 86400000 : 60000;

        for (let i = 0; i < count; i++) {
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
            const diff = basePrice - history[history.length - 1].close;
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
        for (let i = 0; i <= 5; i++) {
            const y = this.padding.top + (this.height - this.padding.top - this.padding.bottom) * (i / 5);
            this.ctx.moveTo(this.padding.left, y);
            this.ctx.lineTo(this.width - this.padding.right, y);
        }
        this.ctx.stroke();

        if (this.chartType === 'line') {
            // === DRAW LINE CHART ===
            const startPrice = visibleData[0].close;
            const endPrice = visibleData[visibleData.length - 1].close;
            const isUp = endPrice >= startPrice;
            const color = isUp ? '#22c55e' : '#ef4444';

            this.ctx.beginPath();
            visibleData.forEach((d, i) => {
                const x = this.padding.left + i * stepX;
                const y = this.padding.top + (max - d.close) * scaleY;
                if (i === 0) this.ctx.moveTo(x, y);
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
                this.ctx.moveTo(x + candleWidth * 0.4, yHigh);
                this.ctx.lineTo(x + candleWidth * 0.4, yLow);
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
        for (let i = 0; i <= 5; i++) {
            const price = min + ((max - min) * (1 - i / 5));
            const y = this.padding.top + (this.height - this.padding.top - this.padding.bottom) * (i / 5);
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
    bindCommunityFeatures(); // New

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
                pct_change: (Math.random() * 4 - 2),
                last_close: (Math.random() * 200 + 100)
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

    // Initial render of posts
    renderCommunityPosts();
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
    for (let i = 5; i >= 1; i--) {
        // Wider spread for realism
        const p = centerPrice + i * 0.04 + Math.random() * 0.02;
        const s = Math.floor(Math.random() * 800) + 50;
        asks += `<tr><td class="text-muted">${s}</td><td>${p.toFixed(2)}</td></tr>`;
    }
    for (let i = 1; i <= 5; i++) {
        const p = centerPrice - i * 0.04 - Math.random() * 0.02;
        const s = Math.floor(Math.random() * 800) + 50;
        bids += `<tr><td class="text-muted">${s}</td><td>${p.toFixed(2)}</td></tr>`;
    }

    asksBody.innerHTML = asks;
    bidsBody.innerHTML = bids;
}

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
        const riskMap = { 1: "Very Conservative", 2: "Conservative", 3: "Moderate", 4: "Aggressive", 5: "Very Aggressive" };
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

    // Skip Login Button (Dev)
    const skipBtn = document.getElementById('btn-skip-login');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            document.getElementById('user-email-display').textContent = "admin";
            // Set default profile if skipped
            userProfile = {
                goal: "Growth",
                risk: "Moderate",
                horizon: "Medium Term"
            };
            document.getElementById('profile-badge').textContent = userProfile.goal;
            document.getElementById('setting-goal-display').textContent = userProfile.goal;
            document.getElementById('setting-risk-display').textContent = userProfile.risk;
            showView('view-app');
            if (marketSnapshot.length > 0) {
                updateTickerTape();
            }
            // Trigger chart resize
            if (chartInstance) setTimeout(() => chartInstance.draw(), 100);
        });
    }
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
    div.innerHTML = `<div class="avatar">${sender === 'bot' ? 'AI' : 'You'}</div><div class="content">${html}</div>`;
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
    } catch (e) { }
}

function updateTickerTape() {
    const container = document.getElementById('ticker-content');
    if (!marketSnapshot.length) return;
    const items = marketSnapshot.map(s => {
        const color = s.pct_change >= 0 ? 'ticker-up' : 'ticker-down';
        return `<span class="ticker-item">${s.symbol} <span class="${color}">${s.pct_change >= 0 ? '+' : ''}${s.pct_change.toFixed(2)}%</span></span>`;
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

    document.getElementById('equity-val').textContent = '$' + equity.toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('buying-power-val').textContent = '$' + paperPortfolio.buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('pnl-val').textContent = (dayPnl >= 0 ? '+' : '') + '$' + dayPnl.toLocaleString(undefined, { minimumFractionDigits: 2 });

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
                <td class="text-end pe-3 font-mono ${color}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</td>
            </tr>`;
        }).join('');
    }
}

function bindModals() {
    const kbCard = document.getElementById('kb-card-1');
    if (kbCard) kbCard.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') new bootstrap.Modal(document.getElementById('modal-article-detail')).show();
    });
    const readBtn = kbCard ? kbCard.querySelector('button') : null;
    if (readBtn) readBtn.addEventListener('click', () => new bootstrap.Modal(document.getElementById('modal-article-detail')).show());

    // Knowledge Base "Ask AI" buttons
    document.querySelectorAll('.ask-ai-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            const topic = btn.getAttribute('data-topic');

            // 1. Navigate to Analysis Tab
            document.querySelector('.nav-item[data-target="section-analysis"]').click();

            // 2. Fill Query
            const queryInput = document.getElementById('query');
            queryInput.value = topic;

            // 3. Submit Form
            document.getElementById('analysis-form').dispatchEvent(new Event('submit'));
        });
    });
}

// --- Community Features ---
function bindCommunityFeatures() {
    // Show modal on "New Post" click
    const newPostBtn = document.querySelector('#section-community button');
    if (newPostBtn) {
        newPostBtn.addEventListener('click', () => {
            new bootstrap.Modal(document.getElementById('modal-new-post')).show();
        });
    }

    // AI Enhance Button Logic
    const enhanceBtn = document.getElementById('btn-ai-enhance-post');
    if (enhanceBtn) {
        enhanceBtn.addEventListener('click', async () => {
            const title = document.getElementById('new-post-title').value.trim();
            const content = document.getElementById('new-post-content');

            if (!title) {
                alert("Please enter a title first so AI knows what to write about.");
                return;
            }

            const originalBtnText = enhanceBtn.innerHTML;
            enhanceBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...';
            enhanceBtn.disabled = true;

            try {
                const prompt = `Write a short, engaging community post (under 280 chars) for a financial forum based on this title: "${title}". Make it sound professional yet conversational.`;

                const res = await fetch(`${API_BASE}/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: prompt, user_profile: "", task: "general" })
                });
                const data = await res.json();

                // Typewriter effect for the content
                content.value = "";
                const text = data.result.replace(/^"|"$/g, ''); // Remove quotes if any
                let i = 0;
                const typeWriter = setInterval(() => {
                    if (i < text.length) {
                        content.value += text.charAt(i);
                        i++;
                    } else {
                        clearInterval(typeWriter);
                    }
                }, 20);

            } catch (err) {
                console.error(err);
                content.value = "Error generating content. Please try again.";
            } finally {
                enhanceBtn.innerHTML = originalBtnText;
                enhanceBtn.disabled = false;
            }
        });
    }

    // Handle Form Submit
    document.getElementById('new-post-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const category = document.getElementById('new-post-category').value;
        const title = document.getElementById('new-post-title').value;
        const content = document.getElementById('new-post-content').value;

        // Create Post Object
        const catColors = { "Analysis": "success", "Question": "warning", "Discussion": "info", "News": "primary" };
        const newPost = {
            id: Date.now(),
            author: "You (Admin)",
            badge: "Admin",
            avatarColor: "bg-primary",
            initials: "AD",
            time: "Just Now",
            category: category,
            catColor: catColors[category] || "secondary",
            title: title,
            content: content,
            likes: 0,
            comments: 0
        };

        // Prepend to array
        communityPosts.unshift(newPost);

        // Re-render
        renderCommunityPosts();

        // Close modal & reset form
        bootstrap.Modal.getInstance(document.getElementById('modal-new-post')).hide();
        e.target.reset();
    });
}

function renderCommunityPosts() {
    const container = document.querySelector('#section-community .row .col-lg-9');
    if (!container) return;

    container.innerHTML = communityPosts.map(post => `
        <div class="card shadow-sm border-0 mb-4 hover-lift clickable-card" onclick="openPostDetail(${post.id})">
            <div class="card-body p-4">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div class="d-flex align-items-center gap-3">
                        <div class="community-avatar ${post.avatarColor} text-white">${post.initials}</div>
                        <div>
                            <h6 class="fw-bold mb-0">${post.author} ${post.badge ? `<span class="badge bg-light text-primary ms-2">${post.badge}</span>` : ''}</h6>
                            <small class="text-muted">${post.time}</small>
                        </div>
                    </div>
                    <span class="badge bg-soft-${post.catColor} text-${post.catColor} rounded-pill px-3">${post.category}</span>
                </div>
                <h5 class="fw-bold mb-2">${post.title}</h5>
                <p class="text-muted mb-3 text-truncate-2">${post.content}</p>
                <div class="d-flex gap-4 text-muted small fw-semibold">
                    <span class="d-flex align-items-center gap-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg> 
                        ${post.likes}
                    </span>
                    <span class="d-flex align-items-center gap-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> 
                        ${post.comments} Comments
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

// Global function for click handler
window.openPostDetail = function (id) {
    const post = communityPosts.find(p => p.id === id);
    if (!post) return;

    const modal = document.getElementById('modal-post-detail');
    // Populate modal data
    modal.querySelector('.community-avatar').className = `community-avatar ${post.avatarColor} text-white`;
    modal.querySelector('.community-avatar').textContent = post.initials;
    modal.querySelector('h5.fw-bold').innerHTML = `${post.author} ${post.badge ? `<span class="badge bg-light text-primary ms-1">${post.badge}</span>` : ''}`;
    modal.querySelector('small.text-muted').textContent = post.time;
    modal.querySelector('h4.fw-bold').textContent = post.title;
    modal.querySelector('p.text-muted.lh-lg').textContent = post.content;
    modal.querySelector('h6.fw-bold.mb-3').textContent = `Comments (${post.comments})`;

    new bootstrap.Modal(modal).show();
};

function bindSettingsInterface() { }
