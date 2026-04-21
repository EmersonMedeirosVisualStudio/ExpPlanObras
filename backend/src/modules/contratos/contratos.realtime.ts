type Subscriber = (event: { topic: string; event: string; payload: any }) => void;

const topicSubscribers = new Map<string, Set<Subscriber>>();

export function subscribe(topic: string, cb: Subscriber) {
  const set = topicSubscribers.get(topic) || new Set<Subscriber>();
  set.add(cb);
  topicSubscribers.set(topic, set);
  return () => {
    const current = topicSubscribers.get(topic);
    if (!current) return;
    current.delete(cb);
    if (!current.size) topicSubscribers.delete(topic);
  };
}

export function publish(topic: string, event: string, payload: any) {
  const set = topicSubscribers.get(topic);
  if (!set) return;
  for (const cb of set) {
    try {
      cb({ topic, event, payload });
    } catch {
    }
  }
}

