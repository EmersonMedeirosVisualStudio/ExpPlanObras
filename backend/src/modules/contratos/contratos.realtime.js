const topicSubscribers = new Map();
export function subscribe(topic, cb) {
    const set = topicSubscribers.get(topic) || new Set();
    set.add(cb);
    topicSubscribers.set(topic, set);
    return () => {
        const current = topicSubscribers.get(topic);
        if (!current)
            return;
        current.delete(cb);
        if (!current.size)
            topicSubscribers.delete(topic);
    };
}
export function publish(topic, event, payload) {
    const set = topicSubscribers.get(topic);
    if (!set)
        return;
    for (const cb of set) {
        try {
            cb({ topic, event, payload });
        }
        catch {
        }
    }
}
