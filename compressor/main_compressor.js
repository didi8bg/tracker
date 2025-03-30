const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

const MONGO_URI = "mongodb://127.0.0.1:27017";
const DB_NAME = "Gateio_funding";
const RAW_COLLECTION = "main_tracking";
const ONE_MIN = "1min_timepoints";
const THREE_MIN = "3min_timepoints";

function log(msg) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, "../logs/main_compressor.log"), logMsg);
  console.log(logMsg.trim());
}

function getLatest(dataArr, endTime, key) {
  return dataArr
    ?.filter((e) => typeof e[key] === "number" && e.t <= endTime)
    .sort((a, b) => b.t - a.t)[0]?.[key] ?? null;
}

async function compress() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const rawCol = db.collection(RAW_COLLECTION);
    const oneMinCol = db.collection(ONE_MIN);
    const threeMinCol = db.collection(THREE_MIN);

    const now = Date.now();
    const oneMinStart = Math.floor(now / 60000) * 60000;
    const threeMinStart = Math.floor(now / 180000) * 180000;
    const endTime = oneMinStart + 59999;

    const docs = await rawCol.find({}).toArray();
    for (const doc of docs) {
      const symbol = doc.s;

      const lastP = getLatest(doc.a, endTime, "p");
      const lastFb = getLatest(doc.b, endTime, "f");
      const lastFby = getLatest(doc.by, endTime, "f");
      const lastFg = getLatest(doc.g, endTime, "f");

      if (lastP !== null || lastFb !== null || lastFby !== null || lastFg !== null) {
        await oneMinCol.updateOne(
          { s: symbol, t: oneMinStart },
          {
            $set: {
              s: symbol,
              t: oneMinStart,
              fb: lastFb,
              fby: lastFby,
              fg: lastFg,
              p: lastP,
            },
          },
          { upsert: true }
        );
      }

      // 3-minute timepoint: use latest available values up to t3+179999
      if (now % (3 * 60000) < 5000) {
        const end3 = threeMinStart + 179999;
        const p3 = getLatest(doc.a, end3, "p");
        const fb3 = getLatest(doc.b, end3, "f");
        const fby3 = getLatest(doc.by, end3, "f");
        const fg3 = getLatest(doc.g, end3, "f");

        if (p3 !== null || fb3 !== null || fby3 !== null || fg3 !== null) {
          await threeMinCol.updateOne(
            { s: symbol, t: threeMinStart },
            {
              $set: {
                s: symbol,
                t: threeMinStart,
                fb: fb3,
                fby: fby3,
                fg: fg3,
                p: p3,
              },
            },
            { upsert: true }
          );
        }
      }
    }

    log("✅ Compression run completed.");
  } catch (err) {
    log("❌ Compression error: " + err.message);
  } finally {
    await client.close();
  }
}

compress();
setInterval(compress, 60000);
