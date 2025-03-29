const { MongoClient } = require('mongodb');
const writeLog = require('./utils/logHelper');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';

async function runTrackedPairsGenerator() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const marginCoins = await db.collection('gateio_margin_coins').find({}).toArray();
  const binance = await db.collection('binance_futures_pairs').find({}).toArray();
  const bybit = await db.collection('bybit_futures_pairs').find({}).toArray();
  const gateio = await db.collection('gateio_futures_pairs').find({}).toArray();

  const marginSet = new Set(marginCoins.map(c => c.symbol));
  const binanceSet = new Set(binance.map(c => c.symbol));
  const bybitSet = new Set(bybit.map(c => c.symbol));
  const gateioSet = new Set(gateio.map(c => c.symbol));

  const tracked = [];

  for (const symbol of marginSet) {
    const onBinance = binanceSet.has(symbol);
    const onBybit = bybitSet.has(symbol);
    const onGateioFutures = gateioSet.has(symbol);

    if (onBinance || onBybit || onGateioFutures) {
      tracked.push({
        symbol,
        onBinance,
        onBybit,
        onGateioFutures,
        active: true,
        updatedAt: new Date()
      });
    }
  }

  const trackedCollection = db.collection('tracked_pairs');
  await trackedCollection.deleteMany({});
  await trackedCollection.insertMany(tracked);

  const logMsg = `✅ Tracked pairs updated: ${tracked.length} pairs`;
  console.log(logMsg);
  writeLog('tracked_pairs_generator.log', logMsg);

  await client.close();
}

module.exports = runTrackedPairsGenerator;

// Run immediately if called directly
if (require.main === module) {
  runTrackedPairsGenerator();
}
