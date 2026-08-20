import { Chart } from '@neabyte/candlestick-cli';
const candles = [{ open: 100, high: 105, low: 99, close: 103, volume: 1000, timestamp: 1640995200000, type: 1 }];
const chart = new Chart(candles, { title: 'BTC', width: 40, height: 10 });
chart.render().then(console.log);
