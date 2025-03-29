const axios = require('axios');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const { GATE_API_KEY, GATE_API_SECRET } = require('../secrets');
const writeLog = require('../utils/logHelper');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';

function signRequest(method, url, queryParams = '', body = '') {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hashedBody = crypto.createHash('sha512').update(body).digest('hex');
  const signatureString = `${method}\n${url}\n${queryParams}\n${hashedBody}\n${timestamp}`;
  const signature = crypto.createHmac('sha512', GATE_API_SECRET).update(signatureString).digest('hex');

  return {
    'KEY': GATE_API_KEY,
    'Timestamp': timestamp,
    'SIGN': signature,
    'Accept': 'application/json'
  };
}

async function fetchGateioFuturesContracts() {
  const urlPath = '/api/v4/futures/usdt/contracts';
  const headers = signRequest('GET', urlPath);

  try {
    const res = await axios.get(`https://fx-api.gateio.ws${urlPath}`, { headers });
    return res.data || [];
  } catch (err) {
    console.error('❌ Failed to fetch Gate.io futures contracts:', err.message);
    writeLog('funding_collector.log', `❌ Failed to fetch Gate.io futures contracts: ${err.message}`);
    return [];
  }
}

async function runFundingCollector() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const tracked = await db.collection('tracked_pairs').find({ active: true }).toArray();
  const binanceSymbols = tracked.filter(p => p.onBinance).map(p => p.symbol.toUpperCase());
  const bybitSymbols = tracked.filter(p => p.onBybit).map(p => p.symbol.toUpperCase());
  const gateioSymbols = tracked.filter(p => p.onGateioFutures).map(p => p.symbol.toUpperCase());

  async function fetchAndSave() {
    const timestamp = new Date();
    const fundingCol = db.collection('funding_history');

    try {
      // 🔵 Binance
      const binanceRes = await axios.get('https://fapi.binance.com/fapi/v1/premiumIndex');
      const binanceMap = {};
      for (const item of binanceRes.data) {
        const base = item.symbol.replace('USDT', '');
        if (binanceSymbols.includes(base)) {
          const rate = +(parseFloat(item.lastFundingRate) * 100).toFixed(6);
          binanceMap[base] = rate;
        }
      }

      // 🟡 Bybit
      const bybitRes = await axios.get('https://api.bybit.com/v5/market/tickers?category=linear');
      const bybitMap = {};
      for (const item of bybitRes.data.result.list) {
        const base = item.symbol.replace('USDT', '');
        if (bybitSymbols.includes(base)) {
          const rate = +(parseFloat(item.fundingRate) * 100).toFixed(6);
          bybitMap[base] = rate;
        }
      }

      // 🔴 Gate.io
      const gateContracts = await fetchGateioFuturesContracts();
      const gateioMap = {};
      for (const item of gateContracts) {
        const base = item.name.replace('_USDT', '');
        if (gateioSymbols.includes(base)) {
          const rate = +(parseFloat(item.funding_rate) * 100).toFixed(6);
          gateioMap[base] = rate;
        }
      }

      // 💾 Save to MongoDB
      for (const { symbol } of tracked) {
        const base = symbol.toUpperCase();
        const entry = {
          symbol: base,
          timestamp,
          binance: binanceMap[base] ?? null,
          bybit: bybitMap[base] ?? null,
          gateio: gateioMap[base] ?? null
        };
        await fundingCol.insertOne(entry);
        const msg = `📈 Funding [${base}] → B:${entry.binance ?? 'X'} | Y:${entry.bybit ?? 'X'} | G:${entry.gateio ?? 'X'}`;
        console.log(msg);
        writeLog('funding_collector.log', msg);
      }
    } catch (err) {
      console.error('❌ Failed to fetch funding data:', err.message);
      writeLog('funding_collector.log', `❌ Funding fetch error: ${err.message}`);
    }
  }

  fetchAndSave();
  setInterval(fetchAndSave, 60 * 1000);
}

module.exports = runFundingCollector;

if (require.main === module) {
  runFundingCollector();
}
