const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'Gateio_funding';
const PORT = 3028;

const app = express();
app.use(cors());
app.use(express.json());

let mongoClient;
async function getDb() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
  }
  return mongoClient.db(DB_NAME);
}

// ✅ Root health check
app.get('/', (req, res) => {
  res.send('✅ Gate.io Margin + Funding API is running.');
});

// ✅ Get latest 1min timepoint for all tracked pairs
app.get('/funding-latest', async (req, res) => {
  try {
    const db = await getDb();
    const tracked = await db.collection('tracked_pairs').find({ tracked: true }).project({ symbol: 1 }).toArray();
    const symbols = tracked.map(t => t.symbol.toUpperCase());

    const collection = db.collection('1min_timepoints');
    const pipeline = [
      { $match: { s: { $in: symbols } } },
      { $sort: { t: -1 } },
      {
        $group: {
          _id: '$s',
          s: { $first: '$s' },
          t: { $first: '$t' },
          p: { $first: '$p' },
          fb: { $first: '$fb' },
          fby: { $first: '$fby' },
          fg: { $first: '$fg' }
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();
    const formatted = {};

    for (const row of results) {
      formatted[row.s] = {
        symbol: row.s,
        timestamp: row.t,
        available: row.p ?? 0,
        binance: row.fb ?? null,
        bybit: row.fby ?? null,
        gateio: row.fg ?? null,
        hourlyInterest: 0 // Placeholder
      };
    }

    res.json(formatted);
  } catch (err) {
    console.error('❌ Failed to fetch timepoints:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ API route for expandable chart (legacy)
app.get('/api/borrow-history/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const db = await getDb();
    const collection = db.collection('1min_timepoints');

    const { range, start, end } = req.query;
    let fromTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let toTime = Date.now();

    if (range === '1d') fromTime = Date.now() - 24 * 60 * 60 * 1000;
    else if (range === '3d') fromTime = Date.now() - 3 * 24 * 60 * 60 * 1000;
    else if (range === '30d') fromTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    else if (start && end) {
      fromTime = new Date(start).getTime();
      toTime = new Date(end).getTime();
    }

    const candles = await collection.find({
      s: symbol,
      t: { $gte: fromTime, $lte: toTime }
    }).sort({ t: 1 }).toArray();

    const formatted = candles.map(c => ({
      timestamp: c.t,
      avgAvailable: c.p,
      binance: c.fb,
      bybit: c.fby,
      gateio: c.fg
    }));

    res.json({ symbol, candles: formatted });
  } catch (err) {
    console.error('❌ Failed to fetch chart data:', err.message);
    res.status(500).json({ error: 'Chart data fetch failed' });
  }
});

// ✅ NEW: Serve real-time timepoints for chart updates
app.get('/api/timepoints/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = req.query.interval || '1m';
    const after = req.query.after ? parseInt(req.query.after) : 0;

    const db = await getDb();
    const collectionName = interval === '1m' ? '1min_timepoints' : `${interval}_timepoints`;
	const collection = db.collection(collectionName);


    const query = { s: symbol };
    if (after) query.t = { $gt: after };

    const docs = await collection.find(query).sort({ t: 1 }).toArray();
    res.json(docs);
  } catch (err) {
    console.error('❌ Failed to fetch timepoints:', err.message);
    res.status(500).json({ error: 'Failed to load timepoints' });
  }
});

// ✅ Start Express server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
