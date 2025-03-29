// ✅ File: C:\Bots\Gate.io monitor IMPORTANT\api\top_movers.js

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';
const LOG_PATH = path.join(__dirname, '../logs/top_movers.log');

function log(msg) {
  const line = `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}

async function getTopMovers({
  hours = 2,
  poolDropThreshold = 0.5,
  fundingThreshold = 0.2
} = {}) {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const borrowHistory = db.collection('borrow_history');
  const fundingHistory = db.collection('funding_history');
  const tracked = await db.collection('tracked_pairs').find({ active: true }).toArray();

  const now = new Date();
  const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);

  log(`🔎 Analyzing top movers over ${hours} hour(s)...`);

  const movers = [];

  for (const { symbol } of tracked) {
    try {
      const [borrowRecent, fundingRecent] = await Promise.all([
        borrowHistory.find({ symbol, timestamp: { $gte: cutoff } }).toArray(),
        fundingHistory.find({ symbol }).sort({ timestamp: -1 }).limit(1).toArray(),
      ]);

      if (!borrowRecent.length) continue;

      const avgAvailable = borrowRecent.reduce((acc, cur) => acc + cur.available, 0) / borrowRecent.length;
      const latestAvailable = borrowRecent[borrowRecent.length - 1].available;

      const dropPercent = (avgAvailable - latestAvailable) / avgAvailable;
      const borrowDrop = dropPercent >= poolDropThreshold;

      const funding = fundingRecent[0];
      const fundingSpike = funding && (
        Math.abs(funding.binance || 0) >= fundingThreshold ||
        Math.abs(funding.bybit || 0) >= fundingThreshold ||
        Math.abs(funding.gateio || 0) >= fundingThreshold
      );

      if (borrowDrop || fundingSpike) {
        movers.push({
          symbol,
          avgAvailable: +avgAvailable.toFixed(2),
          latestAvailable: +latestAvailable.toFixed(2),
          dropPercent: +(dropPercent * 100).toFixed(2),
          funding: funding || null,
        });
      }
    } catch (err) {
      log(`❌ Error scanning ${symbol}: ${err.message}`);
    }
  }

  log(`📦 Found ${movers.length} top movers.`);
  await client.close();
  return movers;
}

// Background scanner loop (optional)
async function runTopMoversLoop() {
  while (true) {
    try {
      const start = Date.now();
      await getTopMovers();
      const duration = (Date.now() - start) / 1000;
      log(`✅ Scan completed in ${duration.toFixed(2)}s`);
    } catch (err) {
      log(`❌ Top Movers fatal error: ${err.stack || err.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // wait 60s
  }
}

// Only run loop if launched directly
if (require.main === module) {
  runTopMoversLoop();
}

module.exports = getTopMovers;
