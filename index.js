'use strict';

/**
 * node-process-utils v0.1.0
 * Basic SIGTERM/SIGINT graceful shutdown only.
 * Handler timeouts, unhandledRejection, uncaughtException, and
 * waitForShutdown added in v1.0.0.
 */

var _handlers     = [];
var _registered   = false;
var _shuttingDown = false;

/**
 * Register a shutdown handler (called in LIFO order on SIGTERM/SIGINT).
 * @param {function} fn
 * @param {object} [options]
 * @param {string} [options.name]
 */
function onShutdown(fn, options) {
  options = options || {};
  _handlers.unshift({ fn, name: options.name || fn.name || 'anonymous' });
  if (!_registered) {
    _registered = true;
    process.on('SIGTERM', function () { _run('SIGTERM'); });
    process.on('SIGINT',  function () { _run('SIGINT');  });
  }
}

async function _run(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log('[node-process-utils] ' + signal + ' received, shutting down…');
  for (var h of _handlers) {
    try {
      var r = h.fn(signal);
      if (r && typeof r.then === 'function') await r;
    } catch (e) {
      console.error('[node-process-utils] Handler "' + h.name + '" threw:', e.message);
    }
  }
  process.exit(0);
}

module.exports = { onShutdown };
