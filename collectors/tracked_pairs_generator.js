const axios = require('axios');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';
const COLLECTION = 'tracked_pairs';
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'pairs_collector.log');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'pairs_collector_error.log');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function logError(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.error(line);
  fs.appendFileSync(ERROR_LOG_FILE, line + '\n');
}

async function fetchBinanceFutures() {
  try {
    const res = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const pairs = res.data.symbols
      .filter(p => p.contractType === 'PERPETUAL' && p.quoteAsset === 'USDT')
      .map(p => p.baseAsset.toUpperCase());
    const unique = [...new Set(pairs)];
    log(`🔵 Binance processed: ${unique.length} pairs`);
    return unique;
  } catch (err) {
    logError(`❌ Binance fetch error: ${err.message}`);
    return [];
  }
}

async function fetchBybitFutures() {
  try {
    const res = await axios.get('https://api.bybit.com/v5/market/instruments-info', {
      params: { category: 'linear' }
    });
    const pairs = (res.data.result?.list || [])
      .filter(item => item.symbol.endsWith('USDT'))
      .map(item => item.symbol.replace('USDT', '').toUpperCase());
    const unique = [...new Set(pairs)];
    log(`🟡 Bybit processed: ${unique.length} pairs`);
    return unique;
  } catch (err) {
    logError(`❌ Bybit fetch error: ${err.message}`);
    return [];
  }
}

async function fetchGateioFutures() {
  try {
    const res = await axios.get('https://api.gateio.ws/api/v4/futures/usdt/contracts');
    const pairs = res.data
      .filter(p => p.name.endsWith('_USDT'))
      .map(p => p.name.replace('_USDT', '').toUpperCase());
    const unique = [...new Set(pairs)];
    log(`🔴 Gate.io Futures processed: ${unique.length} pairs`);
    return unique;
  } catch (err) {
    logError(`❌ Gate.io futures fetch error: ${err.message}`);
    return [];
  }
}

async function fetchGateioCrossMargin() {
  try {
    const all = [];
    const limit = 1000;
    let page = 1;

    while (true) {
      const url = `https://www.gate.io/api/web/v1/uniloan/uni-loan-loan-info?page=${page}&limit=${limit}&loanType=1`;
      const res = await axios.get(url);
      const list = res.data?.data?.list || [];

      if (list.length === 0) break;

      all.push(...list);
      if (list.length < limit) break;

      page++;
    }

    const symbols = all.map(item => item.asset.toUpperCase());
    const unique = [...new Set(symbols)];
    log(`🟢 Gate.io Cross Margin processed: ${unique.length} pairs (from ${all.length} records)`);
    return unique;
  } catch (err) {
    logError(`❌ Gate.io cross margin fetch error: ${err.message}`);
    return [];
  }
}

function mergeAll(binance, bybit, gateioFut, gateioCross) {
  const allSymbols = new Set([...binance, ...bybit, ...gateioFut, ...gateioCross]);
  const now = new Date();

  return [...allSymbols].map(symbol => ({
    symbol,
    binance_futures: binance.includes(symbol),
    bybit_futures: bybit.includes(symbol),
    gateio_futures: gateioFut.includes(symbol),
    gateio_cross: gateioCross.includes(symbol),
    tracked:
      gateioCross.includes(symbol) &&
      (binance.includes(symbol) || bybit.includes(symbol) || gateioFut.includes(symbol)),
    updated: now
  }));
}

async function runCollector() {
  const [binance, bybit, gateioFut, gateioCross] = await Promise.all([
    fetchBinanceFutures(),
    fetchBybitFutures(),
    fetchGateioFutures(),
    fetchGateioCrossMargin()
  ]);

  const merged = mergeAll(binance, bybit, gateioFut, gateioCross);

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const col = db.collection(COLLECTION);

  await col.deleteMany({});
  await col.insertMany(merged);

  log(`✅ All exchanges processed: ${merged.length} symbols saved to ${COLLECTION}`);
  await client.close();

  fs.writeFileSync(path.join(LOG_DIR, 'tracked_pairs_generator.heartbeat'), Date.now().toString());
}

// Run every 15 minutes
runCollector();
setInterval(runCollector, 15 * 60 * 1000);
