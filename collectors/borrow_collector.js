// ✅ File: C:\Bots\Gate.io monitor IMPORTANT\collectors\borrow_collector.js

const axios = require('axios');
const { MongoClient } = require('mongodb');
const writeLog = require('../utils/logHelper');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';

async function runBorrowCollector() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const tracked = await db.collection('tracked_pairs').find({ active: true }).toArray();
  const symbols = tracked.map(t => t.symbol.toUpperCase());

  async function fetchAndSave() {
    try {
      const res = await axios.get('https://www.gate.io/api/web/v1/uniloan/uni-loan-loan-info?page=1&limit=1000&loanType=1');
      const list = res.data?.data?.list || [];

      const timestamp = new Date();
      const historyCollection = db.collection('borrow_history');

      let count = 0;
      for (const symbol of symbols) {
        const item = list.find(c => c.asset.toUpperCase() === symbol);
        if (!item) continue;

        const entry = {
          symbol,
          timestamp,
          available: parseFloat(item.total_lend_available || '0'),
          hourlyInterest: parseFloat(item.hourly_interest || '0')
        };

        await historyCollection.insertOne(entry);
        writeLog('borrow_collector.log', `📊 Borrow [${symbol}] → ${entry.available} @ ${entry.hourlyInterest}/hr`);
        count++;
      }

      writeLog('borrow_collector.log', `✅ Borrow snapshot saved for ${count} coins.`);
    } catch (err) {
      writeLog('borrow_collector.log', `❌ Failed to fetch Gate.io borrow data: ${err.message}`);
    }
  }

  fetchAndSave();
  setInterval(fetchAndSave, 5000);
}

module.exports = runBorrowCollector;

if (require.main === module) {
  runBorrowCollector();
}
