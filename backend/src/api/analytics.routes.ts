import { Router, Request, Response } from "express";
import { AnalyticsService } from "../services/analytics.service.js";
import { logger } from "../logger.js";

const router = Router();
const analyticsService = new AnalyticsService();

/**
 * GET /api/v1/analytics/leaderboard
 *
 * Returns the top 10 streamers and top 10 receivers on the platform,
 * ranked by total streamed volume (sum of stream amounts).
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     topStreamers: [{ address, totalVolume, streamCount }, ...],
 *     topReceivers:  [{ address, totalVolume, streamCount }, ...]
 *   }
 * }
 */
router.get("/leaderboard", async (_req: Request, res: Response) => {
  try {
    const data = await analyticsService.getLeaderboard();
    res.json({ success: true, data });
  } catch (error) {
    logger.error("Failed to retrieve leaderboard", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve leaderboard data.",
    });
  }
});

export default router;
