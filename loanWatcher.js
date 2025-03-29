// ✅ File: C:\Bots\Gate.io monitor IMPORTANT\loanWatcher.js

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const topMoversRoute = require('./api/routes/topMoversRoute'); // ✅ New API route
const borrowHistoryRoute = require('./api/routes/borrowHistoryRoute'); // ✅ Borrow history API

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';
const COINS_COLLECTION = 'gateio_margin_coins';

const app = express(); // ✅ Define app before use
app.use(cors());
app.use(express.json());
app.use('/api', borrowHistoryRoute); // ✅ Mount route after app is defined
app.use('/api', topMoversRoute);

const PORT = 3028;

const historyDir = path.join(__dirname, 'history');
if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir);

// Connect once and reuse
let mongoClient;
async function getDb() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
  }
  return mongoClient.db(DB_NAME);
}

// ✅ Serve top-movers API
//app.use('/api', topMoversRoute);

// Serve coins from MongoDB
app.get('/gateio/available-coins', async (req, res) => {
  try {
    const db = await getDb();
    const coins = await db.collection(COINS_COLLECTION).find({}).toArray();
    res.json(coins.map(c => c.symbol));
  } catch (err) {
    console.error('❌ Failed to read margin coins from Mongo:', err.message);
    res.status(500).json({ error: 'Failed to load margin coins' });
  }
});

// 🔁 Proxy Gate.io borrow info
app.get('/gateio/borrow-info', async (req, res) => {
  try {
    const response = await axios.get('https://www.gate.io/api/web/v1/uniloan/uni-loan-loan-info?page=1&limit=1000&loanType=1');
    res.json(response.data);
  } catch (err) {
    console.error('❌ Failed to proxy Gate.io borrow-info:', err.message);
    res.status(500).json({ error: 'Failed to fetch borrow info from Gate.io' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Gate.io Borrow Backend is running.');
});

// Save historical borrow events
app.post('/history', (req, res) => {
  const { symbol, entry } = req.body;
  if (!symbol || !entry) return res.status(400).json({ error: 'Invalid payload' });

  const filePath = path.join(historyDir, `${symbol.toUpperCase()}.json`);
  let history = [];
  if (fs.existsSync(filePath)) {
    history = JSON.parse(fs.readFileSync(filePath));
  }
  history.push(entry);
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
  res.json({ success: true });
});

// ⏱ Refresh Gate.io margin coin list every 60 minutes
async function fetchAndCacheMarginCoins() {
  try {
    const response = await axios.get('https://www.gate.io/api/web/v1/uniloan/uni-loan-loan-info?page=1&limit=1000&loanType=1');
    const list = response.data?.data?.list || [];
    const coins = [...new Set(list.map(pair => pair.asset.toUpperCase()))].sort();

    const db = await getDb();
    const collection = db.collection(COINS_COLLECTION);
    await collection.deleteMany({});
    await collection.insertMany(coins.map(symbol => ({ symbol })));

    const btc = list.find(c => c.asset.toUpperCase() === 'BTC');
    if (btc) {
      console.log(`🔍 BTC Found: Available = ${btc.total_lend_available}`);
    } else {
      console.log('⚠️ BTC not found in loan data!');
    }

    console.log(`✅ [${new Date().toISOString()}] Saved ${coins.length} margin coins to MongoDB`);
  } catch (err) {
    console.error('❌ Error updating margin coins in MongoDB:', err.message);
  }
}

fetchAndCacheMarginCoins();
setInterval(fetchAndCacheMarginCoins, 60 * 60 * 1000);

// ✅ Return latest funding rate snapshot for all tracked pairs
// ✅ Return latest funding rate snapshot for all tracked pairs
app.get('/funding-latest', async (req, res) => {
  try {
    const db = await getDb();
    const trackedSymbols = await db.collection('tracked_pairs')
      .find({ active: true })
      .project({ symbol: 1, _id: 0 })
      .toArray();

    const activeSymbols = trackedSymbols.map(t => t.symbol.toUpperCase());

    const fundingCollection = db.collection('funding_history');

    const latestEntries = await fundingCollection.aggregate([
      { $match: { symbol: { $in: activeSymbols } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$symbol',
          symbol: { $first: '$symbol' },
          timestamp: { $first: '$timestamp' },
          binance: { $first: '$binance' },
          bybit: { $first: '$bybit' },
          gateio: { $first: '$gateio' }
        }
      }
    ]).toArray();

    const result = {};
    for (const doc of latestEntries) {
      result[doc.symbol] = {
        symbol: doc.symbol,
        timestamp: doc.timestamp,
        binance: doc.binance,
        bybit: doc.bybit,
        gateio: doc.gateio
      };
    }

    res.json(result);
  } catch (err) {
    console.error('❌ Failed to fetch funding snapshot:', err.message);
    res.status(500).json({ error: 'Failed to load funding data' });
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});