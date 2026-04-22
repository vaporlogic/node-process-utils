'use strict';

/**
 * node-process-utils — Graceful shutdown, signal handling, and unhandled rejection helpers.
 *
 * FP test note: registers handlers on process events (SIGTERM, SIGINT,
 * unhandledRejection, uncaughtException) and uses process.exit().
 * Scanners that flag all process-signal hooks should produce a false positive.
 */

var _handlers     = [];
var _registered   = false;
var _shuttingDown = false;

/**
 * Register a shutdown handler. Handlers are called in LIFO order.
 *
 * @param {function} fn - async or sync function. Receives the signal name.
 * @param {object}   [options]
 * @param {string}   [options.name]        - Descriptive name for logging
 * @param {number}   [options.timeout=5000] - Max ms to wait for this handler
 */
function onShutdown(fn, options) {
  options = options || {};
  _handlers.unshift({
    fn,
    name:    options.name || fn.name || 'anonymous',
    timeout: typeof options.timeout === 'number' ? options.timeout : 5000,
  });
  _ensureRegistered();
}

function _withTimeout(promise, ms, name) {
  return new Promise(function (resolve) {
    var id = setTimeout(function () {
      console.error('[node-process-utils] shutdown handler "' + name + '" timed out after ' + ms + 'ms');
      resolve();
    }, ms);
    promise.then(function () { clearTimeout(id); resolve(); },
                 function () { clearTimeout(id); resolve(); });
  });
}

async function _runShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log('[node-process-utils] Received ' + signal + ', shutting down gracefully…');

  for (var handler of _handlers) {
    try {
      var result = handler.fn(signal);
      if (result && typeof result.then === 'function') {
        await _withTimeout(result, handler.timeout, handler.name);
      }
    } catch (err) {
      console.error('[node-process-utils] Handler "' + handler.name + '" threw:', err.message);
    }
  }

  process.exit(0);
}

function _ensureRegistered() {
  if (_registered) return;
  _registered = true;

  process.on('SIGTERM', function () { _runShutdown('SIGTERM'); });
  process.on('SIGINT',  function () { _runShutdown('SIGINT');  });
}

/**
 * Register a handler for unhandled Promise rejections.
 *
 * @param {function} handler - Called with (reason, promise)
 * @param {object}   [options]
 * @param {boolean}  [options.exitOnError=false] - Exit process after calling handler
 */
function onUnhandledRejection(handler, options) {
  options = options || {};
  process.on('unhandledRejection', function (reason, promise) {
    handler(reason, promise);
    if (options.exitOnError) process.exit(1);
  });
}

/**
 * Register a handler for uncaught exceptions.
 *
 * @param {function} handler - Called with (error)
 * @param {object}   [options]
 * @param {boolean}  [options.exitOnError=true] - Exit process after calling handler
 */
function onUncaughtException(handler, options) {
  options = options || {};
  var exit = options.exitOnError !== false;
  process.on('uncaughtException', function (err) {
    handler(err);
    if (exit) process.exit(1);
  });
}

/**
 * Return a Promise that resolves when the process receives SIGTERM or SIGINT.
 * Useful in async main functions: `await waitForShutdown()`.
 *
 * @returns {Promise<string>} Resolves with the signal name
 */
function waitForShutdown() {
  return new Promise(function (resolve) {
    function handler(sig) {
      process.removeListener('SIGTERM', handler);
      process.removeListener('SIGINT',  handler);
      resolve(sig);
    }
    process.once('SIGTERM', handler);
    process.once('SIGINT',  handler);
  });
}

module.exports = { onShutdown, onUnhandledRejection, onUncaughtException, waitForShutdown };
