import { prisma } from "../lib/db.js";
import { logger } from "../logger.js";

export interface LeaderboardEntry {
  address: string;
  totalVolume: string; // sum of stream amounts as string (high-precision)
  streamCount: number;
}

export interface LeaderboardResult {
  topStreamers: LeaderboardEntry[];
  topReceivers: LeaderboardEntry[];
}

export class AnalyticsService {
  /**
   * Aggregate total streamed volume per address and return the top 10
   * streamers (by sender) and top 10 receivers (by receiver).
   *
   * `amount` is stored as a numeric string in the Stream table.
   * We cast to NUMERIC in SQL to get correct ordering and summation.
   */
  async getLeaderboard(): Promise<LeaderboardResult> {
    try {
      const [streamers, receivers] = await Promise.all([
        prisma.$queryRaw<{ address: string; total_volume: string; stream_count: bigint }[]>`
          SELECT
            sender        AS address,
            SUM(amount::NUMERIC)::TEXT AS total_volume,
            COUNT(*)      AS stream_count
          FROM "Stream"
          GROUP BY sender
          ORDER BY SUM(amount::NUMERIC) DESC
          LIMIT 10
        `,
        prisma.$queryRaw<{ address: string; total_volume: string; stream_count: bigint }[]>`
          SELECT
            receiver      AS address,
            SUM(amount::NUMERIC)::TEXT AS total_volume,
            COUNT(*)      AS stream_count
          FROM "Stream"
          GROUP BY receiver
          ORDER BY SUM(amount::NUMERIC) DESC
          LIMIT 10
        `,
      ]);

      const mapEntry = (row: {
        address: string;
        total_volume: string;
        stream_count: bigint;
      }): LeaderboardEntry => ({
        address: row.address,
        totalVolume: row.total_volume,
        streamCount: Number(row.stream_count),
      });

      return {
        topStreamers: streamers.map(mapEntry),
        topReceivers: receivers.map(mapEntry),
      };
    } catch (error) {
      logger.error("Failed to compute leaderboard", error);
      throw error;
    }
  }
}
