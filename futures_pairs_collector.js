const axios = require('axios');
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';

async function fetchBinanceFutures() {
  const res = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
  const pairs = res.data.symbols
    .filter(p => p.contractType === 'PERPETUAL' && p.quoteAsset === 'USDT')
    .map(p => p.baseAsset.toUpperCase());
  return [...new Set(pairs)];
}

async function fetchBybitFutures() {
  const res = await axios.get('https://api.bybit.com/v5/market/instruments-info', {
    params: { category: 'linear' }
  });

  const list = res.data.result.list || [];
  const symbols = list
    .filter(item => item.symbol.endsWith('USDT'))
    .map(item => item.symbol.replace('USDT', '').toUpperCase());

  return [...new Set(symbols)];
}

async function fetchGateioFutures() {
  const res = await axios.get('https://api.gateio.ws/api/v4/futures/usdt/contracts');
  const list = res.data;

  const symbols = list
    .filter(p => p.name.endsWith('_USDT'))
    .map(p => p.name.replace('_USDT', '').toUpperCase());

  return [...new Set(symbols)];
}

async function saveToMongo(collectionName, symbols) {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(collectionName);

  await collection.deleteMany({});
  await collection.insertMany(symbols.map(symbol => ({ symbol })));

  console.log(`✅ Saved ${symbols.length} symbols to ${collectionName}`);
  await client.close();
}

async function runFuturesPairCollector() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] 🔁 Updating futures pairs...`);

    const binance = await fetchBinanceFutures();
    await saveToMongo('binance_futures_pairs', binance);

    const bybit = await fetchBybitFutures();
    await saveToMongo('bybit_futures_pairs', bybit);

    const gateio = await fetchGateioFutures();
    await saveToMongo('gateio_futures_pairs', gateio);

    console.log('🎉 All futures pairs updated.\n');
  } catch (err) {
    console.error('❌ Error during futures pair update:', err.message);
  }
}

async function runFuturesPairCollector() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] 🔁 Updating futures pairs...`);

    const binance = await fetchBinanceFutures();
    await saveToMongo('binance_futures_pairs', binance);

    const bybit = await fetchBybitFutures();
    await saveToMongo('bybit_futures_pairs', bybit);

    const gateio = await fetchGateioFutures();
    await saveToMongo('gateio_futures_pairs', gateio);

    console.log('🎉 All futures pairs updated.\n');
  } catch (err) {
    console.error('❌ Error during futures pair update:', err.message);
  }
}

module.exports = runFuturesPairCollector;

