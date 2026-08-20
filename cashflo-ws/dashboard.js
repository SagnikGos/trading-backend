import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { io } from 'socket.io-client';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { Chart } from '@neabyte/candlestick-cli';

dotenv.config();

const WS_SERVER_URL = process.env.WS_SERVER_URL || 'http://localhost:3001';
let JWT_TOKEN = process.env.JWT_TOKEN;

// Auto-login credentials for the demo
const DEMO_EMAIL = 'test@example.com';
const DEMO_PASSWORD = 'password123';

const screen = blessed.screen({ smartCSR: true, title: 'CashFlo Terminal' });
const grid = new contrib.grid({rows: 12, cols: 12, screen: screen});

const borderStyle = { type: 'line', fg: 'cyan' };

const headerBox = grid.set(0, 0, 1, 12, blessed.box, {
    content: chalk.bold.white('  C A S H F L O   T E R M I N A L  ') + chalk.dim(' | Trade the Flow, Master the Market'),
    style: { bg: 'blue', fg: 'white' },
    valign: 'middle'
});

const priceChart = grid.set(1, 0, 6, 8, blessed.box, {
    label: ' Candlestick Chart ', border: borderStyle,
    content: '\n\n   Waiting for data (need 5 ticks)...',
    tags: false // Disable tags because the candlestick package outputs raw ANSI escape codes!
});

const priceTable = grid.set(1, 8, 6, 4, contrib.table, {
    keys: true, fg: 'white', selectedFg: 'white', selectedBg: 'blue',
    interactive: false, label: ' Live Quotes ', border: borderStyle,
    columnSpacing: 1, columnWidth: [6, 9, 9, 6]
});

const portfolioBox = grid.set(7, 0, 4, 4, blessed.box, {
    label: ' Portfolio ', tags: true, border: borderStyle, padding: { left: 1 }
});

const logBox = grid.set(7, 4, 4, 8, blessed.log, {
    fg: 'green', tags: true, label: ' Event Log ', border: borderStyle, scrollback: 100
});

const inputPrompt = grid.set(11, 0, 1, 12, blessed.textbox, {
    label: ' Command (buy/sell TICKER QTY PRICE | help) ',
    border: borderStyle, inputOnFocus: true, style: { fg: 'green' }
});

const prices = {};
const candleHistory = {}; // { TICKER: [ {open, high, low, close, volume, timestamp, type} ] }
let activeChartTicker = 'AAPL'; // Default chart
const lastPrices = {};

function formatVolume(vol) {
    if (vol === 0 || !vol) return '0';
    if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(1) + 'k';
    return vol.toString();
}

function updatePriceTable() {
    const data = [];
    for (const [ticker, info] of Object.entries(prices)) {
        let changeStr = info.change >= 0 ? chalk.green('+' + info.change.toFixed(2)) : chalk.red(info.change.toFixed(2));
        data.push([
            chalk.bold(ticker), 
            '$' + info.price.toFixed(2), 
            changeStr, 
            chalk.dim(formatVolume(info.volume))
        ]);
    }
    priceTable.setData({ headers: ['Sym', 'Price', 'Change', 'Vol'], data });
    screen.render();
}

async function renderChart() {
    if (!activeChartTicker || !candleHistory[activeChartTicker] || candleHistory[activeChartTicker].length < 5) {
        priceChart.setContent('\n\n   Waiting for data (need 5 ticks) for ' + activeChartTicker + '...');
        screen.render();
        return;
    }
    
    let w = typeof priceChart.width === 'number' ? priceChart.width : 60;
    let h = typeof priceChart.height === 'number' ? priceChart.height : 15;
    
    // adjust for borders
    w = Math.max(20, w - 2);
    h = Math.max(10, h - 2);
    
    try {
        const chart = new Chart(candleHistory[activeChartTicker], {
            title: activeChartTicker,
            width: w,
            height: h
        });
        
        const chartString = await chart.render();
        priceChart.setContent(chartString);
        priceChart.setLabel(` Candlestick Chart (${activeChartTicker}) `);
        screen.render();
    } catch(e) {
        priceChart.setContent('\n\n   Chart render error: ' + e.message);
        screen.render();
    }
}

async function refreshPortfolio() {
    try {
        const res = await fetch(WS_SERVER_URL + '/api/trading/portfolio', { headers: { 'Authorization': 'Bearer ' + JWT_TOKEN } });
        if (res.ok) {
            const data = await res.json();
            let content = '{bold}Cash Balance:{/bold} $' + data.balance.toFixed(2) + '\n\n{bold}Positions:{/bold}\n';
            data.positions.forEach(p => { 
                content += '  ' + chalk.cyan(p.ticker) + ': ' + p.quantity + ' sh @ $' + p.avgPrice.toFixed(2) + '\n'; 
            });
            content += '\n{bold}Open Orders:{/bold}\n';
            data.openOrders.forEach(o => { 
                const sideColor = o.side === 'BUY' ? chalk.green('BUY ') : chalk.red('SELL');
                content += '  ' + sideColor + ' ' + o.quantity + ' ' + o.ticker + ' @ ' + (o.price ? '$'+o.price : 'MKT') + '\n'; 
            });
            portfolioBox.setContent(content);
            screen.render();
        }
    } catch(e) {}
}

let socket;

async function autoLogin() {
    try {
        // Ensure user exists first
        await fetch(WS_SERVER_URL + '/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
        });
        
        const res = await fetch(WS_SERVER_URL + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
        });
        if (res.ok) {
            const data = await res.json();
            JWT_TOKEN = data.token;
            return true;
        }
    } catch(e) {}
    return false;
}

async function initTerminal() {
    logBox.log(chalk.gray('Authenticating...'));
    await autoLogin();
    
    socket = io(WS_SERVER_URL, { auth: { token: JWT_TOKEN } });
    
    socket.on('connect', () => { 
        logBox.log(chalk.gray('Connected to server. Initializing initial watchlists...')); 
        socket.emit('subscribe', ['AAPL', 'GOOG', 'NVDA']); 
        refreshPortfolio(); 
    });

    socket.on('stock_update', async (data) => {
        for (const [ticker, info] of Object.entries(data)) { 
            prices[ticker] = info; 
            
            if (!candleHistory[ticker]) {
                candleHistory[ticker] = [];
            }
            
            let prevPrice = lastPrices[ticker] || info.price;
            let cOpen = prevPrice;
            let cClose = info.price;
            let variance = Math.abs(cClose - cOpen) * 0.5;
            if (variance === 0) variance = info.price * 0.001;
            
            let cHigh = Math.max(cOpen, cClose) + variance;
            let cLow = Math.min(cOpen, cClose) - variance;
            
            candleHistory[ticker].push({
                open: cOpen,
                high: cHigh,
                low: cLow,
                close: cClose,
                volume: info.volume,
                timestamp: Date.now(),
                type: cClose >= cOpen ? 1 : -1
            });
            
            if (candleHistory[ticker].length > 100) {
                candleHistory[ticker].shift();
            }
            
            lastPrices[ticker] = info.price;
        }
        
        updatePriceTable();
        await renderChart();
    });

    socket.on('disconnect', () => { logBox.log(chalk.red('Disconnected')); });
    
    setInterval(refreshPortfolio, 3000);
}

inputPrompt.on('submit', async (text) => {
    inputPrompt.clearValue(); inputPrompt.focus();
    if (!text.trim()) return;
    const parts = text.trim().split(' ');
    const cmd = parts[0].toUpperCase();
    
    if (cmd === 'HELP') {
        let helpMsg = [
            chalk.cyan('Available Commands:'),
            `  ${chalk.bold('buy')} TICKER QTY [PRICE]  - Buy Market or Limit order`,
            `  ${chalk.bold('sell')} TICKER QTY [PRICE] - Sell Market or Limit order`,
            `  ${chalk.bold('watch')} TICKER           - Subscribe to live prices`,
            `  ${chalk.bold('chart')} TICKER           - Switch candlestick chart to TICKER`,
            `  ${chalk.bold('help')}                    - Show this help message`
        ].join('\n');
        logBox.log(helpMsg);
        return;
    }
    
    if (cmd === 'CHART' && parts[1]) {
        activeChartTicker = parts[1].toUpperCase();
        logBox.log(chalk.green(`Switched chart to ${activeChartTicker}`));
        await renderChart();
        return;
    }
    
    if (cmd === 'WATCH' && parts[1]) {
        const ticker = parts[1].toUpperCase();
        try {
            const res = await fetch(WS_SERVER_URL + '/api/stocks/watchlist', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + JWT_TOKEN },
                body: JSON.stringify({ tickers: [ticker] })
            });
            if (res.ok) {
                socket.emit('subscribe', [ticker]);
                logBox.log(chalk.green(`Successfully subscribed to live prices for ${ticker}`));
                activeChartTicker = ticker;
                await renderChart();
            } else {
                const errData = await res.json().catch(() => ({}));
                logBox.log(chalk.red(`Failed to add ${ticker}: ${errData.error || res.statusText}`));
            }
        } catch(e) { logBox.log(chalk.red('Network error while adding ticker')); }
        return;
    }
    
    if ((cmd === 'BUY' || cmd === 'SELL') && parts.length >= 3) {
        const side = cmd;
        let ticker, quantity, price;

        if (isNaN(parts[1]) && !isNaN(parts[2])) {
            // e.g. buy AAPL 10
            ticker = parts[1].toUpperCase();
            quantity = parseInt(parts[2]);
            price = parts[3] ? parseFloat(parts[3]) : null;
        } else if (!isNaN(parts[1]) && isNaN(parts[2])) {
            // e.g. buy 10 AAPL
            quantity = parseInt(parts[1]);
            ticker = parts[2].toUpperCase();
            price = parts[3] ? parseFloat(parts[3]) : null;
        } else {
            logBox.log(chalk.red('Invalid format. Use: buy TICKER QTY [PRICE]'));
            return;
        }

        if (quantity <= 0) {
            logBox.log(chalk.red('Quantity must be greater than 0'));
            return;
        }

        const type = price ? 'LIMIT' : 'MARKET';
        try {
            const res = await fetch(WS_SERVER_URL + '/api/trading/order', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + JWT_TOKEN },
                body: JSON.stringify({ ticker, type, side, quantity, price })
            });
            if (res.ok) { 
                logBox.log(chalk.yellow(`Order Placed: ${side} ${quantity} ${ticker}`)); 
                refreshPortfolio(); 
            }
            else { 
                const errData = await res.json().catch(() => ({}));
                logBox.log(chalk.red('Order Error: ' + (errData.error || res.statusText))); 
            }
        } catch(e) { logBox.log(chalk.red('Failed to send order')); }
    } else { 
        logBox.log(chalk.dim('Unknown command. Type "help" for a list of commands.')); 
    }
});

screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
inputPrompt.focus();
screen.render();

initTerminal();
