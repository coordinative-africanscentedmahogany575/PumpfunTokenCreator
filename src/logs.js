const EventEmitter = require('events');

class LogBus extends EventEmitter {
  constructor() {
    super();
    this.buffer = [];
    this.max = 1000;
  }
  push(entry) {
    this.buffer.push(entry);
    if (this.buffer.length > this.max) this.buffer.shift();
    this.emit('log', entry);
  }
  recent(n = 200) {
    return this.buffer.slice(-n);
  }
}

const bus = new LogBus();

function log(category, message, data) {
  const entry = { ts: Date.now(), category, message, data: data ?? null };
  bus.push(entry);
}

function sse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // send initial heartbeat and recent logs
  const init = JSON.stringify({ type: 'init', logs: bus.recent(200) });
  res.write(`event: init\n`);
  res.write(`data: ${init}\n\n`);

  const onLog = (entry) => {
    res.write(`event: log\n`);
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };
  bus.on('log', onLog);

  req.on('close', () => {
    bus.off('log', onLog);
    try { res.end(); } catch {}
  });
}

module.exports = { log, sse, recent: (...args) => bus.recent(...args) };

