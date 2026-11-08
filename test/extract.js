'use strict';
// Dependency-free test harness: pull the marked logic block out of index.html,
// append CommonJS exports, and require it — so tests run against the exact
// shipped source with no build step.
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
// Temp module lives OUTSIDE test/ so `node --test test/` doesn't discover it
// as a test file. `node --test` runs each test file in its own process, so the
// filename is made unique per process + call to avoid parallel files clobbering
// each other's extracted module (which caused intermittent failures).
const TMP_DIR = path.join(__dirname, '..', '.tmp-logic');
let tmpSeq = 0;

const START = '/* ==LOGIC-START== */';
const END = '/* ==LOGIC-END== */';

// Every logic symbol the test suite needs. Add names here as logic grows.
const EXPORTS = ['normalizeKey', 'makeCustomId', 'addCustomItem', 'reconcile', 'enrich',
  'applyFilters', 'pickSurprise', 'progress', 'deriveAreas', 'makeStore', 'safeStorage',
  'suggestNames', 'searchItems', 'generatePlan', 'travelTime', 'boroughOf', 'contrastRatio', 'THEMES',
  'SEED', 'KB_EXTRA', 'V1_RENAMES'];

function extractLogic(htmlPath = HTML_PATH) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Logic markers not found in ' + htmlPath);
  }
  return html.slice(start + START.length, end);
}

function loadLogic() {
  const source = extractLogic();
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tmpModule = path.join(TMP_DIR, 'logic-' + process.pid + '-' + (tmpSeq++) + '.cjs');
  const exportsLine = '\nmodule.exports = { ' + EXPORTS.join(', ') + ' };\n';
  fs.writeFileSync(tmpModule, source + exportsLine, 'utf8');
  return require(tmpModule);
}

module.exports = { extractLogic, loadLogic, HTML_PATH, EXPORTS };
