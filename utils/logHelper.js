// ✅ File: C:\Bots\Gate.io monitor IMPORTANT\utils\logHelper.js

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const SHARED_LOG = path.join(LOG_DIR, 'shared.log');

function writeLog(fileName, message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  // Write to module-specific log
  const moduleLog = path.join(LOG_DIR, fileName);
  fs.appendFileSync(moduleLog, logLine);

  // Write to shared log
  fs.appendFileSync(SHARED_LOG, logLine);

  // Also print to console
  console.log(message);
}

module.exports = writeLog;
