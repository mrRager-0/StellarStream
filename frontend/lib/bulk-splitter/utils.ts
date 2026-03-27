// lib/bulk-splitter/utils.ts
//
// Pure, side-effect-free utilities for reward calculation and batching.
// All arithmetic uses BigInt to prevent floating-point precision loss.

import type { Voter, Recipient } from './types';

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string or JSON string/array into a Voter[].
 *
 * Accepted CSV format (header row required):
 *   address,governance_score
 *   GABC...,1500
 *
 * Accepted JSON format:
 *   [{ "address": "GABC...", "governance_score": 1500 }, ...]
 */
export function parseSnapshotData(rawData: string): Voter[] {
  const trimmed = rawData.trim();

  // JSON path
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as Array<{ address: string; governance_score: number | string }>;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((row) => ({
      address: String(row.address).trim(),
      governance_score: BigInt(row.governance_score),
    }));
  }

  // CSV path
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  // Skip header row
  const dataLines = lines[0].toLowerCase().includes('address') ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const [address, score] = line.split(',');
    return {
      address: address.trim(),
      governance_score: BigInt(score.trim()),
    };
  });
}

// ── Pro-rata calculation ──────────────────────────────────────────────────────

/**
 * Distribute `totalReward` among voters proportional to governance_score.
 *
 * Dust (remainder from integer division) is allocated to the highest-scoring
 * voter so the sum of all amounts equals exactly `totalReward`.
 */
export function calculateRewards(voters: Voter[], totalReward: bigint): Recipient[] {
  if (voters.length === 0) return [];

  const totalScore = voters.reduce((acc, v) => acc + v.governance_score, 0n);
  if (totalScore === 0n) return voters.map((v) => ({ address: v.address, amount: 0n }));

  // Floor division for each voter.
  const recipients: Recipient[] = voters.map((v) => ({
    address: v.address,
    amount: (totalReward * v.governance_score) / totalScore,
  }));

  // Compute dust and assign to the highest-scoring voter.
  const distributed = recipients.reduce((acc, r) => acc + r.amount, 0n);
  const dust = totalReward - distributed;

  if (dust > 0n) {
    let maxIdx = 0;
    for (let i = 1; i < voters.length; i++) {
      if (voters[i].governance_score > voters[maxIdx].governance_score) maxIdx = i;
    }
    recipients[maxIdx] = {
      ...recipients[maxIdx],
      amount: recipients[maxIdx].amount + dust,
    };
  }

  return recipients;
}

// ── Batching ──────────────────────────────────────────────────────────────────

/** Default safe batch size for the stellar_stream_v3 Soroban contract. */
export const DEFAULT_BATCH_SIZE = 100;

/**
 * Split `recipients` into chunks of at most `batchSize`.
 * The last chunk may be smaller.
 */
export function chunkRecipients(
  recipients: Recipient[],
  batchSize: number = DEFAULT_BATCH_SIZE,
): Recipient[][] {
  const chunks: Recipient[][] = [];
  for (let i = 0; i < recipients.length; i += batchSize) {
    chunks.push(recipients.slice(i, i + batchSize));
  }
  return chunks;
}
