'use strict';

// BroadcastChannel-shaped bridge across Chrome and TouchDesigner's CEF process.
class TDChannel {
  constructor(role) {
    this.id = globalThis.crypto?.randomUUID?.() || `td-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.queue = [];
    this.ready = false;
    this.closed = false;
    this.events = new EventSource(`/td-live/events?id=${this.id}&role=${role}`);
    this.events.onopen = () => {
      this.ready = true;
      this.onstatus?.('connected');
      if (role === 'control') this.postMessage({ t: 'hello' });
      this.flush();
    };
    this.events.onerror = () => {
      this.ready = false;
      this.queue.length = 0; // Never replay old button presses on reconnect.
      this.onstatus?.('disconnected');
    };
    this.events.onmessage = event => {
      try { this.onmessage?.({ data: JSON.parse(event.data) }); }
      catch (error) { console.error('TD live message:', error); }
    };
  }
  postMessage(message) {
    if (!this.ready || this.closed) return;
    const snapshot = JSON.stringify(message);
    // Coalesce replaceable telemetry and consecutive changes to one slider.
    const key = message.t === 'g' ? `g:${message.k}` : ['state', 'padraw'].includes(message.t) ? message.t : null;
    const tail = this.queue[this.queue.length - 1];
    if (key && tail?.key === key) tail.body = snapshot;
    else if (this.queue.length < 128) this.queue.push({ key, body: snapshot });
    else { this.queue.length = 0; this.onstatus?.('overloaded'); return; }
    this.flush();
  }
  async flush() {
    if (this.sending || !this.ready || this.closed) return;
    this.sending = true;
    try {
      while (this.queue.length && this.ready && !this.closed) {
        const next = this.queue.shift();
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 2000);
        try {
          const response = await fetch(`/td-live/message?id=${this.id}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: next.body, signal: abort.signal
          });
          if (!response.ok) throw new Error(`TD bridge HTTP ${response.status}`);
        } finally { clearTimeout(timeout); }
      }
    } catch (error) {
      this.queue.length = 0;
      this.onstatus?.('disconnected');
      console.warn(error);
    } finally { this.sending = false; }
  }
  close() { this.closed = true; this.ready = false; this.queue.length = 0; this.events.close(); }
}
globalThis.TDChannel = TDChannel;
