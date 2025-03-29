// ✅ File: C:\Bots\Gate.io monitor IMPORTANT\start_gate_io.js

console.log('🚀 Starting Gate.io Monitor System...');

const writeLog = require('./utils/logHelper');
const runFuturesPairCollector = require('./futures_pairs_collector');
const runTrackedPairsGenerator = require('./tracked_pairs_generator');
const runBorrowCollector = require('./collectors/borrow_collector');
const runFundingCollector = require('./collectors/funding_collector');
const runBorrowCompressor = require('./collectors/borrow_compressor');

require('./loanWatcher.js');

function safeRun(fn, name) {
  try {
    fn();
    writeLog('start_gate_io.log', `✅ Started: ${name}`);
  } catch (err) {
    writeLog('start_gate_io.log', `❌ Failed to start ${name}: ${err.message}`);
  }
}

safeRun(runBorrowCollector, 'Borrow Collector');
safeRun(runFundingCollector, 'Funding Collector');
safeRun(runBorrowCompressor, 'Borrow Compressor');

(async () => {
  try {
    await runFuturesPairCollector();
    await runTrackedPairsGenerator();
    writeLog('start_gate_io.log', '✅ Initial futures + tracked pairs fetched');
  } catch (err) {
    writeLog('start_gate_io.log', `❌ Initial fetch error: ${err.message}`);
  }
})();

setInterval(async () => {
  try {
    await runFuturesPairCollector();
    await runTrackedPairsGenerator();
    writeLog('start_gate_io.log', '🔁 Refreshed futures and tracked pairs');
  } catch (err) {
    writeLog('start_gate_io.log', `❌ Refresh error: ${err.message}`);
  }
}, 10 * 60 * 1000);
