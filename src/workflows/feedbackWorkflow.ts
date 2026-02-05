import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { DatabaseService } from "../services/database";
import { WorkersAIService } from "../services/ai";
import { AISearchService } from "../services/search";

export interface FeedbackWorkflowParams {
  feedbackId: number;
  source: string;
  content: string;
  timestamp: number;
  user_id?: string;
  metadata?: string;
}

interface FeedbackWorkflowEnv {
  DB: D1Database;
  AI: any;
  SEARCH: any;
}

export class FeedbackWorkflow extends WorkflowEntrypoint<FeedbackWorkflowEnv, FeedbackWorkflowParams> {
  async run(event: WorkflowEvent<FeedbackWorkflowParams>, step: WorkflowStep) {
    const { feedbackId, content } = event.payload;

    const sentimentResult = await step.do(
      "sentiment-analysis",
      { retries: { limit: 3, delay: "2 seconds" } },
      async () => {
        const ai = new WorkersAIService(this.env.AI);
        const result = await ai.analyzeSentiment(content);
        const db = new DatabaseService(this.env.DB);
        await db.updateFeedbackSentiment(feedbackId, result.sentiment, result.score);
        return { sentiment: result.sentiment, score: result.score };
      }
    );

    const similar = await step.do(
      "find-similar",
      { retries: { limit: 3, delay: "2 seconds" } },
      async () => {
        const search = new AISearchService(this.env.SEARCH);
        const results = await search.findSimilarFeedback(content, 10);
        return results.map((r) => ({ id: r.id, score: r.score }));
      }
    );

    await step.do(
      "group-feedback",
      { retries: { limit: 3, delay: "2 seconds" } },
      async () => {
        const similarIds = similar
          .map((r) => parseInt(r.id, 10))
          .filter((id) => !isNaN(id) && id > 0 && id !== feedbackId);
        if (similarIds.length === 0) return { linked: false };

        const db = new DatabaseService(this.env.DB);
        let caseIdToUse: number | null = null;
        for (const sid of similarIds) {
          const caseIds = await db.getCaseIdsByFeedbackId(sid);
          if (caseIds.length > 0) {
            caseIdToUse = caseIds[0];
            break;
          }
        }

        if (caseIdToUse != null) {
          await db.linkFeedbackToCase(caseIdToUse, feedbackId);
          return { linked: true, caseId: caseIdToUse };
        }

        const title = content.length > 50 ? content.substring(0, 50) + "…" : content;
        const newCaseId = await db.createCase({ title, status: "open" });
        await db.linkFeedbackToCase(newCaseId, feedbackId);
        for (const fid of similarIds) {
          await db.linkFeedbackToCase(newCaseId, fid);
        }
        return { linked: true, caseId: newCaseId };
      }
    );

    return { sentiment: sentimentResult, feedbackId };
  }
}
