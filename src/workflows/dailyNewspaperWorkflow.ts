import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { DatabaseService } from "../services/database";
import { WorkersAIService } from "../services/ai";
import { buildEditionInput, generateEdition } from "../services/newsroomEdition";

interface DailyNewspaperWorkflowEnv {
  DB: D1Database;
  AI: any;
}

export class DailyNewspaperWorkflow extends WorkflowEntrypoint<DailyNewspaperWorkflowEnv, void> {
  async run(event: WorkflowEvent<void>, step: WorkflowStep) {
    const loaded = await step.do(
      "load-data",
      { retries: { limit: 3, delay: "2 seconds" } },
      async () => {
        const db = new DatabaseService(this.env.DB);
        return buildEditionInput(db);
      }
    );

    const edition = await step.do(
      "generate-edition",
      { retries: { limit: 3, delay: "5 seconds" } },
      async () => {
        const ai = new WorkersAIService(this.env.AI);
        return generateEdition(ai, loaded);
      }
    );

    const editionDate = new Date().toISOString().slice(0, 10);
    await step.do(
      "store-edition",
      { retries: { limit: 3, delay: "2 seconds" } },
      async () => {
        const db = new DatabaseService(this.env.DB);
        await db.insertDailyEdition(editionDate, JSON.stringify(edition));
        return { editionDate };
      }
    );

    return { editionDate, success: true };
  }
}
