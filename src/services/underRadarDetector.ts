import { DatabaseService } from "./database";
import { WorkersAIService } from "./ai";
import { calculateSeverityScore, isUnderRadar } from "../utils/scoring";

export class UnderRadarDetector {
  constructor(
    private db: DatabaseService,
    private ai: WorkersAIService
  ) { }

  /**
   * Process all unanalyzed feedback and flag items flying under the radar
   */
  async detectUnderRadar(): Promise<number> {
    const allFeedback = await this.db.getAllFeedback(1000);
    let flaggedCount = 0;

    for (const feedback of allFeedback) {
      if (!feedback.id) continue;

      // Check if already flagged
      const existingFlag = await this.db.getUnderRadarFlagByFeedbackId(feedback.id);
      if (existingFlag) continue;

      // Calculate severity score
      const severityScore = calculateSeverityScore(feedback.content);

      // Use AI to detect under radar items
      const aiAnalysis = await this.ai.detectUnderRadar(feedback.content);

      // Flag if it meets criteria
      if (isUnderRadar(severityScore.score) || aiAnalysis.isUnderRadar) {
        await this.db.insertUnderRadarFlag({
          feedback_id: feedback.id,
          severity_score: Math.max(severityScore.score, aiAnalysis.severity),
          reason: `AI: ${aiAnalysis.reason}. Scoring: ${severityScore.reason}`
        });
        flaggedCount++;
      }
    }

    return flaggedCount;
  }

  /**
   * Process a single feedback item
   */
  async analyzeFeedback(feedbackId: number): Promise<boolean> {
    const feedback = await this.db.getFeedbackById(feedbackId);
    if (!feedback || !feedback.id) return false;

    const existingFlag = await this.db.getUnderRadarFlagByFeedbackId(feedback.id);
    if (existingFlag) return true;

    const severityScore = calculateSeverityScore(feedback.content);
    const aiAnalysis = await this.ai.detectUnderRadar(feedback.content);

    if (isUnderRadar(severityScore.score) || aiAnalysis.isUnderRadar) {
      await this.db.insertUnderRadarFlag({
        feedback_id: feedback.id,
        severity_score: Math.max(severityScore.score, aiAnalysis.severity),
        reason: `AI: ${aiAnalysis.reason}. Scoring: ${severityScore.reason}`
      });
      return true;
    }

    return false;
  }
}
