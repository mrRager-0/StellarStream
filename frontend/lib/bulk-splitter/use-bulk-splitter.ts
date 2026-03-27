'use client';

// lib/bulk-splitter/use-bulk-splitter.ts

import { useState, useCallback, useRef } from 'react';
import { chunkRecipients, DEFAULT_BATCH_SIZE } from './utils';
import type { Voter, Recipient } from './types';

export type BulkSplitterStatus = 'idle' | 'parsing' | 'calculating' | 'ready' | 'error';

export interface UseBulkSplitterReturn {
  status: BulkSplitterStatus;
  voters: Voter[];
  batches: Recipient[][];
  /** Total number of recipients across all batches. */
  totalRecipients: number;
  error: string | null;
  /** Parse raw CSV/JSON data via the Web Worker. */
  parse: (rawData: string) => void;
  /** Calculate rewards via the Web Worker once voters are loaded. */
  calculate: (totalReward: bigint, batchSize?: number) => void;
  reset: () => void;
}

export function useBulkSplitter(): UseBulkSplitterReturn {
  const [status, setStatus] = useState<BulkSplitterStatus>('idle');
  const [voters, setVoters] = useState<Voter[]>([]);
  const [batches, setBatches] = useState<Recipient[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('./bulk-splitter.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return workerRef.current;
  }, []);

  const parse = useCallback(
    (rawData: string) => {
      setStatus('parsing');
      setError(null);
      const worker = getWorker();

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'parsed') {
          // Rehydrate governance_score strings back to BigInt.
          const rehydrated: Voter[] = msg.voters.map(
            (v: { address: string; governance_score: string }) => ({
              address: v.address,
              governance_score: BigInt(v.governance_score),
            }),
          );
          setVoters(rehydrated);
          setStatus('idle');
        } else if (msg.type === 'error') {
          setError(msg.message);
          setStatus('error');
        }
      };

      worker.postMessage({ type: 'parse', rawData });
    },
    [getWorker],
  );

  const calculate = useCallback(
    (totalReward: bigint, batchSize: number = DEFAULT_BATCH_SIZE) => {
      if (voters.length === 0) return;
      setStatus('calculating');
      setError(null);
      const worker = getWorker();

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'calculated') {
          const recipients: Recipient[] = msg.recipients.map(
            (r: { address: string; amount: string }) => ({
              address: r.address,
              amount: BigInt(r.amount),
            }),
          );
          setBatches(chunkRecipients(recipients, batchSize));
          setStatus('ready');
        } else if (msg.type === 'error') {
          setError(msg.message);
          setStatus('error');
        }
      };

      // Serialise voters (BigInt → string) for structured clone.
      const serialised = voters.map((v) => ({
        ...v,
        governance_score: v.governance_score.toString(),
      }));
      worker.postMessage({
        type: 'calculate',
        voters: serialised,
        totalReward: totalReward.toString(),
      });
    },
    [voters, getWorker],
  );

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setStatus('idle');
    setVoters([]);
    setBatches([]);
    setError(null);
  }, []);

  return {
    status,
    voters,
    batches,
    totalRecipients: batches.reduce((acc, b) => acc + b.length, 0),
    error,
    parse,
    calculate,
    reset,
  };
}
