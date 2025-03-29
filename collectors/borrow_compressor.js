const { MongoClient } = require('mongodb');
const writeLog = require('../utils/logHelper');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';
const RAW_COLLECTION = 'borrow_history';
const CANDLE_1M = 'borrow_candles_1m';
const CANDLE_3M = 'borrow_candles_3m';
const STATE_COLLECTION = 'borrow_compression_state';

const RAW_DATA_RETENTION_MS = 60 * 60 * 1000; // 1 hour
const CHUNK_MINUTES = 15;

// 🔁 Re-added for performance (index creation)
async function createIndexes(db) {
  await db.collection(RAW_COLLECTION).createIndex({ symbol: 1, timestamp: -1 });
  await db.collection(CANDLE_1M).createIndex({ symbol: 1, timestamp: -1 });
  await db.collection(CANDLE_3M).createIndex({ symbol: 1, timestamp: -1 });
  await db.collection(STATE_COLLECTION).createIndex({ symbol: 1 }, { unique: true });
}

function roundDownToMinute(date, intervalMinutes = 1) {
  const ms = intervalMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

function aggregateAverages(entries, intervalMinutes) {
  const grouped = {};

  for (const entry of entries) {
    const bucket = roundDownToMinute(new Date(entry.timestamp), intervalMinutes).toISOString();
    const key = `${entry.symbol}_${bucket}`;
    if (!grouped[key]) {
      grouped[key] = {
        symbol: entry.symbol,
        timestamp: new Date(bucket),
        sumAvailable: entry.available,
        sumInterest: entry.hourlyInterest,
        count: 1,
      };
    } else {
      const g = grouped[key];
      g.sumAvailable += entry.available;
      g.sumInterest += entry.hourlyInterest;
      g.count += 1;
    }
  }

  return Object.values(grouped).map(g => ({
    symbol: g.symbol,
    timestamp: g.timestamp,
    avgAvailable: +(g.sumAvailable / g.count).toFixed(6),
    avgHourlyInterest: +(g.sumInterest / g.count).toFixed(6),
    count: g.count
  }));
}

async function getLastCompressedTimestamp(db, symbol) {
  const state = await db.collection(STATE_COLLECTION).findOne({ symbol });
  const last = state?.lastCompressed ? new Date(state.lastCompressed) : null;

  const earliest = await db.collection(RAW_COLLECTION).find({ symbol }).sort({ timestamp: 1 }).limit(1).toArray();
  const firstEntryTime = earliest[0]?.timestamp;

  if (!firstEntryTime) return new Date(); // Nothing to compress yet

  return (!last || last < firstEntryTime) ? new Date(firstEntryTime) : last;
}

async function updateLastCompressedTimestamp(db, symbol, timestamp) {
  await db.collection(STATE_COLLECTION).updateOne(
    { symbol },
    { $set: { lastCompressed: timestamp.toISOString() } },
    { upsert: true }
  );
}

async function compressSymbolInChunks(db, symbol, startTime, endTime) {
  const rawCol = db.collection(RAW_COLLECTION);
  const col1m = db.collection(CANDLE_1M);
  const col3m = db.collection(CANDLE_3M);

  let current = new Date(startTime);
  const final = new Date(endTime);

  while (current < final) {
    const chunkStart = new Date(current);
    const chunkEnd = new Date(current.getTime() + CHUNK_MINUTES * 60 * 1000);

    const docs = await rawCol.find({
      symbol,
      timestamp: { $gte: chunkStart, $lt: chunkEnd }
    }).toArray();

    try {
      const candles1m = aggregateAverages(docs, 1);
      const candles3m = aggregateAverages(docs, 3);

      if (candles1m.length) await col1m.insertMany(candles1m);
      if (candles3m.length) await col3m.insertMany(candles3m);

      writeLog('borrow_compressor.log', `✅ ${symbol}: ${candles1m.length} x 1m, ${candles3m.length} x 3m for chunk ${chunkStart.toISOString()}`);

      await updateLastCompressedTimestamp(db, symbol, chunkEnd);
    } catch (err) {
      writeLog('borrow_compressor.log', `❌ ${symbol} chunk ${chunkStart.toISOString()}: ${err.message}`);
    }

    current = chunkEnd;
  }
}

async function runBorrowCompressor() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  await createIndexes(db); // ✅ Re-added here

  const now = new Date();
  const cutoff = roundDownToMinute(now);
  const symbols = await db.collection(RAW_COLLECTION).distinct('symbol');

  for (const symbol of symbols) {
    try {
      const last = await getLastCompressedTimestamp(db, symbol);
      await compressSymbolInChunks(db, symbol, last, cutoff);
    } catch (err) {
      writeLog('borrow_compressor.log', `❌ Error processing ${symbol}: ${err.message}`);
    }
  }

  const cutoffDelete = new Date(now.getTime() - RAW_DATA_RETENTION_MS);
  const deleted = await db.collection(RAW_COLLECTION).deleteMany({ timestamp: { $lt: cutoffDelete } });
  writeLog('borrow_compressor.log', `🧹 Deleted ${deleted.deletedCount} raw entries older than ${cutoffDelete.toISOString()}`);

  await client.close();
}

runBorrowCompressor();
setInterval(runBorrowCompressor, 60 * 1000);

module.exports = runBorrowCompressor;
