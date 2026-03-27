// lib/bulk-splitter/types.ts

export interface Voter {
  address: string;
  governance_score: bigint;
}

export interface Recipient {
  address: string;
  amount: bigint;
}
