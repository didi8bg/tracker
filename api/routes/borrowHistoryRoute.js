// ✅ File: C:\Bots\Gate.io monitor IMPORTANT\api\routes\borrowHistoryRoute.js

const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';
const CANDLE_COLLECTION = 'borrow_candles_1m';
const FUNDING_COLLECTION = 'funding_history';

let client;
async function getDb() {
  if (!client) {
    client = new MongoClient(MONGO_URI);
    await client.connect();
  }
  return client.db(DB_NAME);
}

router.get('/borrow-history/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const db = await getDb();

  try {
    const candles = await db.collection(CANDLE_COLLECTION)
      .find({ symbol: symbol.toUpperCase() })
      .sort({ timestamp: 1 })
      .limit(100)
      .toArray();

    // Fetch funding rate snapshots for each timestamp
    const fundingSnapshots = await db.collection(FUNDING_COLLECTION)
      .find({ symbol: symbol.toUpperCase() })
      .sort({ timestamp: 1 })
      .toArray();

    // Match closest funding rate per candle timestamp
    const withFunding = candles.map(candle => {
      const t = new Date(candle.timestamp).getTime();
      const nearest = fundingSnapshots.find(f => {
        const ft = new Date(f.timestamp).getTime();
        return Math.abs(ft - t) <= 5 * 60 * 1000; // within 5 mins
      });

      return {
        ...candle,
        binance: nearest?.binance ?? null,
        bybit: nearest?.bybit ?? null,
        gateio: nearest?.gateio ?? null
      };
    });

    res.json({ candles: withFunding });
  } catch (err) {
    console.error('❌ Error in /api/borrow-history:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
