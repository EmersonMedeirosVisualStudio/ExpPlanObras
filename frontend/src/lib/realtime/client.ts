type Handler = (eventName: string, payload: any) => void;

class RealtimeClient {
  private es: EventSource | null = null;
  private topics: string[] = [];
  private handlers = new Map<string, Set<Handler>>();
  private backoff = 2000;
  private maxBackoff = 60000;
  private connecting = false;

  start(topics: string[]) {
    this.topics = Array.from(new Set(topics)).filter(Boolean);
    if (!this.topics.length) return;
    if (this.connecting) return;
    this.connect();
  }

  private connect() {
    this.connecting = true;
    const qs = encodeURIComponent(this.topics.join(','));
    const base = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
    let token = '';
    try {
      token = localStorage.getItem('token') || '';
    } catch {
      token = '';
    }
    const tokenQs = encodeURIComponent(token);
    const es = new EventSource(`${base}/api/contratos/realtime/stream?topics=${qs}&token=${tokenQs}`);
    this.es = es;

    es.onopen = () => {
      this.connecting = false;
      this.backoff = 2000;
    };

    es.onerror = () => {
      this.scheduleReconnect();
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data || '{}');
        const topic = data?.topic ? String(data.topic) : null;
        const eventName = data?.event ? String(data.event) : 'message';
        if (!topic) return;
        const key = `${topic}:${eventName}`;
        const hs = this.handlers.get(key);
        if (hs && hs.size) {
          for (const h of hs) h(eventName, data.payload ?? null);
        }
      } catch {}
    };
  }

  private scheduleReconnect() {
    const es = this.es;
    if (es) {
      try {
        es.close();
      } catch {}
    }
    this.es = null;
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
    setTimeout(() => this.connect(), wait);
  }

  subscribe(topic: string, eventName: string, handler: Handler) {
    const key = `${topic}:${eventName}`;
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(handler);
    return () => {
      this.handlers.get(key)?.delete(handler);
    };
  }
}

export const realtimeClient = new RealtimeClient();
