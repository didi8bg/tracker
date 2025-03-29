// ✅ File: C:\Bots\Gate.io monitor IMPORTANT\api\routes\topMoversRoute.js

const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';
const CANDLES_COLLECTION = 'borrow_candles_1m';
const FUNDING_COLLECTION = 'funding_history';
const TRACKED_COLLECTION = 'tracked_pairs';
const LOG_PATH = path.join(__dirname, '../../logs/top_movers.log');

// Helper: Log to file
function logToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_PATH, `[${timestamp}] ${message}\n`);
}

// Helper: Get date range
function getStartDate(hoursOrDays) {
  const now = new Date();
  const msBack = typeof hoursOrDays === 'number'
    ? hoursOrDays * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - msBack);
}

// API Route for Top Movers
router.get('/top-movers', async (req, res) => {
  const { hours = 24, poolDrop = 0.5, funding = 0.2, showHistory = false, period = '7d' } = req.query;

  const dropThreshold = parseFloat(poolDrop);
  const fundingThreshold = parseFloat(funding);
  const avgHours = parseInt(hours);
  const candleLimit = avgHours * 60;

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  try {
    const tracked = await db.collection(TRACKED_COLLECTION)
      .find({ active: true })
      .project({ symbol: 1 })
      .toArray();

    const symbols = tracked.map(t => t.symbol);
    const startDate = getStartDate(avgHours);
    const movers = [];

    // Logging and timing
    console.time('Top Movers Computation');
    logToFile(`\n🔍 Checking ${symbols.length} active symbols...`);

    for (const symbol of symbols) {
      const candles = await db.collection(CANDLES_COLLECTION)
        .find({ symbol, timestamp: { $gte: startDate } })
        .sort({ timestamp: 1 })
        .limit(candleLimit)
        .toArray();

      if (candles.length < 10) continue;

      const avgPool = candles.reduce((sum, c) => sum + c.avgAvailable, 0) / candles.length;
      const minPool = Math.min(...candles.map(c => c.avgAvailable));
      const poolDropPercent = (avgPool - minPool) / avgPool;

      const latestFunding = await db.collection(FUNDING_COLLECTION)
        .find({ symbol })
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();

      const { binance = 0, bybit = 0, gateio = 0 } = latestFunding[0] || {};
      const fundingExceeded = [binance, bybit, gateio].some(v => Math.abs(v) >= fundingThreshold);

      let reason = [];
      if (poolDropPercent >= dropThreshold) {
        reason.push(`Borrow Drop by ${poolDropPercent.toFixed(2)}%`);
      }
      if (fundingExceeded) {
        const fundingValues = [
          binance && `Binance: ${binance.toFixed(4)}%`,
          bybit && `Bybit: ${bybit.toFixed(4)}%`,
          gateio && `Gate.io: ${gateio.toFixed(4)}%`
        ].filter(Boolean).join(" | ");
        reason.push(`Funding Rate: ${fundingValues}`);
      }

      if (reason.length > 0) {
        movers.push({
          symbol,
          poolDropPercent: +poolDropPercent.toFixed(4),
          reason: reason.join(" | "),  // Add the reason to the result
          binance,
          bybit,
          gateio
        });
      }
    }

    console.timeEnd('Top Movers Computation');
    logToFile(`✅ Found ${movers.length} movers.`);

    res.json(movers);  // Send the movers data to the frontend
  } catch (err) {
    console.error('❌ top-movers error:', err.message);
    res.status(500).json({ error: 'Failed to compute top movers' });
  } finally {
    await client.close();
  }
});

module.exports = router;
