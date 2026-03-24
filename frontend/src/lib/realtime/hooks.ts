import { useEffect, useRef } from 'react';
import { realtimeClient } from './client';

export function useRealtimeTopic(topic: string, onEvent: (eventName: string, payload: any) => void, eventNames?: string[]) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
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
  }, [topic, (eventNames || []).join('|')]);
}

export function useRealtimeEvent(topic: string, eventName: string, handler: (payload: any) => void) {
  const cb = useRef(handler);
  cb.current = handler;
  useEffect(() => {
    return realtimeClient.subscribe(topic, eventName, (_ev, payload) => cb.current(payload));
  }, [topic, eventName]);
}

