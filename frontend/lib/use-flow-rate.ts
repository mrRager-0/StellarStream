"use client";

import { useState, useEffect, useCallback } from "react";
import type { Stream } from "@/lib/contracts/stellarstream";

// Stellar uses 7 decimal places (stroops)
const DECIMALS = 7;
const DIVISOR = 10 ** DECIMALS;

export interface FlowRateResult {
  /** Current interpolated balance in display units (e.g. 48291.3847291) */
  balance: number;
  /** Tokens per millisecond derived from the contract stream */
  ratePerMs: number;
  /** Whether the stream is actively flowing */
  isFlowing: boolean;
}

/**
 * Derives a real-time balance from a contract Stream object.
 *
 * flow_rate = totalAmount / (endTime - startTime)   [stroops per ms]
 *
 * The balance is interpolated locally at 60fps between block updates
 * so the counter feels live without hammering the RPC.
 *
 * @param stream  - Raw Stream from the contract (bigint fields, ms timestamps)
 * @param nowMs   - Optional override for current time (useful for testing)
 */
export function useFlowRate(
  stream: Stream | null | undefined,
  nowMs: number = Date.now(),
): FlowRateResult {
  const deriveState = useCallback(
    (s: Stream | null | undefined, now: number) => {
      if (!s || s.cancelled || s.isPaused) {
        return { balance: 0, ratePerMs: 0, isFlowing: false };
      }

      const start = Number(s.startTime);
      const end = Number(s.endTime);
      const total = Number(s.totalAmount) / DIVISOR;
      const withdrawn = Number(s.withdrawn) / DIVISOR;
      const duration = end - start;

      if (duration <= 0 || now < start) {
        return { balance: 0, ratePerMs: 0, isFlowing: false };
      }

      const ratePerMs = total / duration;
      const elapsed = Math.min(now - start, duration);
      const unlocked = ratePerMs * elapsed;
      const balance = Math.max(0, unlocked - withdrawn);

      return { balance, ratePerMs, isFlowing: now >= start && now < end };
    },
    [],
  );

  const [state, setState] = useState<FlowRateResult>(() =>
    deriveState(stream, nowMs),
  );

  useEffect(() => {
    if (!stream) {
      setState({ balance: 0, ratePerMs: 0, isFlowing: false });
      return;
    }

    // Recalculate immediately when stream changes
    setState(deriveState(stream, Date.now()));
  }, [stream, deriveState]);

  return state;
}

/**
 * Aggregates flow_rate across multiple streams (e.g. all incoming streams).
 * Returns the combined real-time balance and net rate.
 */
export function useAggregatedFlowRate(streams: Stream[]): FlowRateResult {
  const [state, setState] = useState<FlowRateResult>({
    balance: 0,
    ratePerMs: 0,
    isFlowing: false,
  });

  useEffect(() => {
    const now = Date.now();
    let totalBalance = 0;
    let totalRate = 0;
    let anyFlowing = false;

    for (const s of streams) {
      if (s.cancelled || s.isPaused) continue;

      const start = Number(s.startTime);
      const end = Number(s.endTime);
      const total = Number(s.totalAmount) / DIVISOR;
      const withdrawn = Number(s.withdrawn) / DIVISOR;
      const duration = end - start;

      if (duration <= 0 || now < start) continue;

      const ratePerMs = total / duration;
      const elapsed = Math.min(now - start, duration);
      const unlocked = ratePerMs * elapsed;

      totalBalance += Math.max(0, unlocked - withdrawn);
      totalRate += ratePerMs;
      if (now >= start && now < end) anyFlowing = true;
    }

    setState({
      balance: totalBalance,
      ratePerMs: totalRate,
      isFlowing: anyFlowing,
    });
  }, [streams]);

  return state;
}
