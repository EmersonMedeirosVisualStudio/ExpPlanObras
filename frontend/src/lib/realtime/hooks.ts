import { useEffect, useRef } from 'react';
import { realtimeClient } from './client';

type RealtimePayload = unknown;

export function useRealtimeTopic(topic: string, onEvent: (eventName: string, payload: RealtimePayload) => void, eventNames?: string[]) {
  const cb = useRef(onEvent);

  useEffect(() => {
    cb.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const offs: (() => void)[] = [];
    const names = eventNames && eventNames.length ? eventNames : ['message'];
    for (const name of names) {
      offs.push(
        realtimeClient.subscribe(topic, name, (ev, payload) => {
          cb.current(ev, payload);
        })
      );
    }
    return () => {
      offs.forEach((off) => off());
    };
  }, [topic, eventNames]);
}

export function useRealtimeEvent(topic: string, eventName: string, handler: (payload: RealtimePayload) => void) {
  const cb = useRef(handler);

  useEffect(() => {
    cb.current = handler;
  }, [handler]);

  useEffect(() => {
    return realtimeClient.subscribe(topic, eventName, (_ev, payload) => cb.current(payload));
  }, [topic, eventName]);
}
