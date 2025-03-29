const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = 3001;

const coinsCachePath = path.join(__dirname, 'coins.json');
const historyDir = path.join(__dirname, 'history');
if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir);

// Serve coins from cached file
app.get('/gateio/available-coins', (req, res) => {
  try {
    if (fs.existsSync(coinsCachePath)) {
      const data = fs.readFileSync(coinsCachePath);
      const coins = JSON.parse(data);
      return res.json(coins);
    } else {
      return res.status(404).json({ error: 'Coin list cache not found' });
    }
  } catch (err) {
    console.error('❌ Failed to read coins cache:', err.message);
    res.status(500).json({ error: 'Failed to load cached coin list' });
  }
});

// 🔁 New proxy endpoint for borrowing info
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

// Handle history save from frontend
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

// Auto-refresh coins.json every 60 minutes
const fetchAndCacheCoins = async () => {
  try {
    const response = await axios.get('https://www.gate.io/api/web/v1/uniloan/uni-loan-loan-info?page=1&limit=1000&loanType=1');
    const list = response.data?.data?.list || [];
    const coins = [...new Set(list.map(pair => pair.asset.toUpperCase()))].sort();
    fs.writeFileSync(coinsCachePath, JSON.stringify(coins, null, 2));

    const btc = list.find(c => c.asset.toUpperCase() === 'BTC');
    if (btc) {
      console.log(`🔍 BTC Found: Available = ${btc.total_lend_available}`);
    } else {
      console.log('⚠️ BTC not found in loan data!');
    }

    console.log(`✅ [${new Date().toISOString()}] Cached ${coins.length} coins to coins.json`);
  } catch (err) {
    console.error('❌ Error updating coin cache:', err.message);
  }
};

fetchAndCacheCoins();
setInterval(fetchAndCacheCoins, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
