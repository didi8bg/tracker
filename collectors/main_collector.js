const axios = require('axios');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GATE_API_KEY, GATE_API_SECRET } = require('../secrets');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';
const COLLECTION = 'main_tracking';

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
const FUNDING_LOG = path.join(LOG_DIR, 'funding_collector.log');
const BORROW_LOG = path.join(LOG_DIR, 'borrow_collector.log');

function log(msg, file) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(file, line + '\n');
}

function shortDate(ts = Date.now()) {
  return new Date(ts).toISOString().split('T')[0];
}

async function ensureIndexes(col) {
  await col.createIndex({ s: 1 });
  await col.createIndex({ "b.t": 1 });
  await col.createIndex({ "by.t": 1 });
  await col.createIndex({ "g.t": 1 });
  await col.createIndex({ "a.t": 1 });
  log(`✅ Indexes ensured on fields s, b.t, by.t, g.t, a.t`, FUNDING_LOG);
}

async function updateFieldHistory(col, symbol, field, data) {
  await col.updateOne(
    { s: symbol },
    { $setOnInsert: { s: symbol, b: [], by: [], g: [], a: [] } },
    { upsert: true }
  );
  await col.updateOne(
    { s: symbol },
    { $push: { [field]: data } }
  );
}

async function pruneOldEntries(col) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pruneField = async (field) => {
    await col.updateMany(
      { [field]: { $exists: true } },
      { $pull: { [field]: { t: { $lt: cutoff } } } }
    );
  };
  await Promise.all(['a', 'b', 'by', 'g'].map(pruneField));
}

async function fetchTrackedPairs() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const tracked = await db.collection('tracked_pairs').find({ tracked: true }).toArray();
  await client.close();
  return tracked.map(t => t.symbol);
}

// ========== BORROW POOLS ==========
async function fetchBorrowAvailability(col, trackedSymbols) {
  try {
    const res = await axios.get('https://www.gate.io/api/web/v1/uniloan/uni-loan-loan-info?page=1&limit=1000&loanType=1');
    const list = res.data?.data?.list || [];
    const timestamp = Date.now();

    let count = 0;
    for (const item of list) {
      const symbol = item.asset?.toUpperCase();
      if (!trackedSymbols.includes(symbol)) continue;

      const entry = {
        d: shortDate(timestamp),
        p: parseFloat(parseFloat(item.total_lend_available || '0').toFixed(2)),
        t: timestamp
      };

      await updateFieldHistory(col, symbol, 'a', entry);
      count++;
    }

    log(`✅ Borrow pool updated for ${count} symbols`, BORROW_LOG);
  } catch (err) {
    log(`❌ Borrow fetch error: ${err.message}`, BORROW_LOG);
  }
}

// ========== FUNDING RATES ==========
async function fetchFundingRates(col, trackedSymbols) {
  const timestamp = Date.now();

  const pushFunding = async (field, symbol, value) => {
    const entry = { d: shortDate(timestamp), f: parseFloat(parseFloat(value).toFixed(5)), t: timestamp };
    await updateFieldHistory(col, symbol, field, entry);
  };

  try {
    // Binance
    const binanceRes = await axios.get('https://fapi.binance.com/fapi/v1/premiumIndex');
    const binanceList = binanceRes.data || [];
    let biCount = 0;
    for (const item of binanceList) {
      const symbol = item.symbol.replace('USDT', '');
      if (!trackedSymbols.includes(symbol)) continue;
      await pushFunding('b', symbol, item.lastFundingRate);
      biCount++;
    }
    log(`✅ Binance funding updated for ${biCount} symbols`, FUNDING_LOG);
  } catch (err) {
    log(`❌ Binance funding error: ${err.message}`, FUNDING_LOG);
  }

  try {
    // Bybit
    const bybitRes = await axios.get('https://api.bybit.com/v5/market/tickers', {
      params: { category: 'linear' }
    });
    const bybitList = bybitRes.data?.result?.list || [];
    let byCount = 0;
    for (const item of bybitList) {
      const symbol = item.symbol.replace('USDT', '');
      if (!trackedSymbols.includes(symbol)) continue;
      await pushFunding('by', symbol, item.fundingRate);
      byCount++;
    }
    log(`✅ Bybit funding updated for ${byCount} symbols`, FUNDING_LOG);
  } catch (err) {
    log(`❌ Bybit funding error: ${err.message}`, FUNDING_LOG);
  }

  try {
    // Gate.io
    const urlPath = '/api/v4/futures/usdt/contracts';
    const gateTs = Math.floor(Date.now() / 1000).toString();
    const hashedBody = crypto.createHash('sha512').update('').digest('hex');
    const signatureString = `GET\n${urlPath}\n\n${hashedBody}\n${gateTs}`;
    const sign = crypto.createHmac('sha512', GATE_API_SECRET).update(signatureString).digest('hex');

    const headers = {
      KEY: GATE_API_KEY,
      Timestamp: gateTs,
      SIGN: sign,
      Accept: 'application/json'
    };

    const res = await axios.get(`https://fx-api.gateio.ws${urlPath}`, { headers });
    const list = res.data || [];
    let gCount = 0;

    for (const item of list) {
      const symbol = item.name.replace('_USDT', '').toUpperCase();
      if (!trackedSymbols.includes(symbol)) continue;

      const funding = +(parseFloat(item.funding_rate) * 100).toFixed(6);
      await pushFunding('g', symbol, funding);
      gCount++;
    }

    log(`✅ Gate.io funding updated for ${gCount} symbols`, FUNDING_LOG);
  } catch (err) {
    log(`❌ Gate.io funding error: ${err.message}`, FUNDING_LOG);
  }
}

// ========== MAIN LOOP ==========
async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const col = db.collection(COLLECTION);
  await ensureIndexes(col);

  const trackedSymbols = await fetchTrackedPairs();

  const runBorrow = async () => {
    await fetchBorrowAvailability(col, trackedSymbols);
    await pruneOldEntries(col);
  };

  const runFunding = async () => {
    await fetchFundingRates(col, trackedSymbols);
    await pruneOldEntries(col);
  };

  runBorrow();
  runFunding();

  setInterval(runBorrow, 5000);
  setInterval(runFunding, 60000);
}

main();
