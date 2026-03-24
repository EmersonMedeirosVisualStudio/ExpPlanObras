"use client";

import { useEffect } from "react";
import { realtimeClient } from "@/lib/realtime/client";

export default function RealtimeProvider({ topics, children }: { topics: string[]; children: React.ReactNode }) {
  useEffect(() => {
    realtimeClient.start(topics);
  }, [topics.join(",")]);
  return <>{children}</>;
}
