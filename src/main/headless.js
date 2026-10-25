'use strict';

// Runs the game without Electron (plain Node.js). Open the printed links in a browser.
// usage: node src/main/headless.js

const os = require('os');
const path = require('path');
const { startCore } = require('./core');

const dataDir = process.env.QMR_DATA || path.join(os.homedir(), '.quacknana-marble-race');

startCore({ dataDir, version: require('../../package.json').version })
  .then((core) => {
    console.log('QuackNana Marble Race is running');
    console.log('  game screen / OBS browser source: ' + core.url);
    console.log('  control panel:                    ' + core.url + 'control');
    const stop = () => {
      core.shutdown();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
