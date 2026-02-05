import { handleApiRequest } from "./routes/api";
import { handlePageRequest } from "./routes/pages";
import { DatabaseService } from "./services/database";
import { UnderRadarDetector } from "./services/underRadarDetector";
import { WorkersAIService } from "./services/ai";
import { AISearchService } from "./services/search";
import { buildEditionInput, generateEdition } from "./services/newsroomEdition";
import { mockFeedback } from "./utils/mockData";
import { FeedbackWorkflow } from "./workflows/feedbackWorkflow";
import { DailyNewspaperWorkflow } from "./workflows/dailyNewspaperWorkflow";

export { FeedbackWorkflow } from "./workflows/feedbackWorkflow";
export { DailyNewspaperWorkflow } from "./workflows/dailyNewspaperWorkflow";

export interface Env {
  DB: D1Database;
  AI: any;
  SEARCH: any;
  FEEDBACK_WORKFLOW?: { create(options?: { id?: string; params?: unknown }): Promise<{ id: string }> };
  DAILY_NEWSPAPER_WORKFLOW?: { create(options?: { id?: string; params?: unknown }): Promise<{ id: string }> };
}

async function seedMockFeedback(env: Env, db: DatabaseService, search: AISearchService): Promise<void> {
  for (const feedback of mockFeedback) {
    const feedbackId = await db.insertFeedback(feedback);
    await search.indexFeedback(feedbackId, feedback.content, {
      source: feedback.source,
      timestamp: feedback.timestamp
    });

    if (env.FEEDBACK_WORKFLOW) {
      try {
        await env.FEEDBACK_WORKFLOW.create({
          id: `feedback-${feedbackId}`,
          params: {
            feedbackId,
            source: feedback.source,
            content: feedback.content,
            timestamp: feedback.timestamp,
            user_id: feedback.user_id,
            metadata: feedback.metadata
          }
        });
      } catch (_) {
        // Idempotent: instance may already exist
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Serve CSS file
    if (pathname === "/styles.css") {
      // Read CSS from file system
      try {
        // In Cloudflare Workers, we'll serve it inline
        const css = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Georgia', 'Times New Roman', serif;
  line-height: 1.6;
  color: #333;
  background: #f5f5f5;
  padding: 20px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  padding: 40px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.newsroom-header {
  border-bottom: 4px double #000;
  padding-bottom: 20px;
  margin-bottom: 30px;
}

.newsroom-header h1 {
  font-size: 3em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 10px;
}

.newsroom-date {
  font-size: 0.9em;
  color: #666;
  font-style: italic;
}

.top-story {
  border-left: 4px solid #d32f2f;
  padding-left: 20px;
  margin-bottom: 40px;
}

.top-story h2 {
  font-size: 2em;
  color: #d32f2f;
  margin-bottom: 15px;
}

.top-story-content {
  font-size: 1.1em;
  line-height: 1.8;
}

.section {
  margin-bottom: 40px;
  padding-bottom: 30px;
  border-bottom: 1px solid #ddd;
}

.section:last-child {
  border-bottom: none;
}

.section-title {
  font-size: 1.5em;
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 10px;
  color: #000;
  letter-spacing: 1px;
}

.section-intro {
  font-size: 1em;
  color: #555;
  font-style: italic;
  margin-bottom: 20px;
  line-height: 1.6;
  padding-left: 5px;
}

.story-item {
  margin-bottom: 25px;
  padding: 15px;
  background: #fafafa;
  border-left: 3px solid #666;
  transition: all 0.3s ease;
}

.story-item:hover {
  background: #f0f0f0;
  border-left-color: #d32f2f;
  transform: translateX(5px);
}

.story-item h3 {
  font-size: 1.2em;
  margin-bottom: 10px;
  color: #000;
}

.story-item p {
  color: #555;
  margin-bottom: 10px;
}

.story-meta {
  font-size: 0.85em;
  color: #888;
  font-style: italic;
}

.open-case-btn {
  display: inline-block;
  padding: 8px 16px;
  background: #000;
  color: white;
  text-decoration: none;
  font-weight: bold;
  text-transform: uppercase;
  font-size: 0.85em;
  letter-spacing: 1px;
  transition: background 0.3s ease;
  border: none;
  cursor: pointer;
  margin-top: 10px;
}

.open-case-btn:hover {
  background: #d32f2f;
}

.under-radar-alert {
  background: #fff3cd;
  border-left: 4px solid #ffc107;
  padding: 15px;
  margin-bottom: 15px;
}

.under-radar-alert strong {
  color: #856404;
}

.court-header {
  text-align: center;
  border-bottom: 4px double #000;
  padding-bottom: 20px;
  margin-bottom: 30px;
}

.court-header h1 {
  font-size: 2.5em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.case-title {
  font-size: 1.8em;
  text-align: center;
  margin-bottom: 30px;
  padding: 15px;
  background: #f5f5f5;
  border: 2px solid #000;
}

.court-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-bottom: 30px;
}

.court-panel {
  padding: 20px;
  border: 2px solid #ddd;
  background: #fafafa;
}

.court-panel h2 {
  font-size: 1.5em;
  text-transform: uppercase;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 2px solid #000;
}

.prosecution-panel {
  border-color: #d32f2f;
}

.prosecution-panel h2 {
  color: #d32f2f;
}

.defense-panel {
  border-color: #1976d2;
}

.defense-panel h2 {
  color: #1976d2;
}

.verdict-panel {
  grid-column: 1 / -1;
  padding: 25px;
  background: #fff;
  border: 3px solid #000;
}

.verdict-panel h2 {
  font-size: 1.8em;
  text-align: center;
  margin-bottom: 20px;
}

.verdict-content {
  font-size: 1.1em;
  line-height: 1.8;
}

.urgency-badge {
  display: inline-block;
  padding: 5px 15px;
  background: #000;
  color: white;
  font-weight: bold;
  text-transform: uppercase;
  font-size: 0.9em;
  margin: 10px 0;
}

.urgency-critical {
  background: #d32f2f;
}

.urgency-high {
  background: #f57c00;
}

.urgency-medium {
  background: #fbc02d;
  color: #000;
}

.urgency-low {
  background: #388e3c;
}

.feedback-list {
  list-style: none;
  margin-top: 15px;
}

.feedback-list li {
  padding: 10px;
  margin-bottom: 10px;
  background: white;
  border-left: 3px solid #ccc;
}

.feedback-list li strong {
  display: block;
  margin-bottom: 5px;
  color: #000;
}

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  color: #666;
  text-decoration: none;
  font-size: 0.9em;
}

.back-link:hover {
  color: #000;
  text-decoration: underline;
}

.loading {
  text-align: center;
  padding: 40px;
  font-size: 1.2em;
  color: #666;
}

.error {
  background: #ffebee;
  border-left: 4px solid #d32f2f;
  padding: 15px;
  margin: 20px 0;
  color: #c62828;
}

@media (max-width: 768px) {
  .container {
    padding: 20px;
  }

  .newsroom-header h1 {
    font-size: 2em;
  }

  .court-layout {
    grid-template-columns: 1fr;
  }

  .verdict-panel {
    grid-column: 1;
  }
}`;
        return new Response(css, {
          headers: { "Content-Type": "text/css" },
        });
      } catch (error) {
        return new Response("/* CSS Error */", {
          headers: { "Content-Type": "text/css" },
        });
      }
    }

    // Initialize database on first request (dev only)
    if (pathname === "/init" && request.method === "POST") {
      try {
        const url = new URL(request.url);
        const clean = url.searchParams.get("clean") === "true";

        const db = new DatabaseService(env.DB);
        const search = new AISearchService(env.SEARCH);

        // Clean database if requested
        if (clean) {
          await db.cleanDatabase();
        }

        await db.initializeSchema();

        await seedMockFeedback(env, db, search);

        // Run under radar detection
        const ai = new WorkersAIService(env.AI);
        const detector = new UnderRadarDetector(db, ai);
        await detector.detectUnderRadar();

        // Generate a single edition based on the freshly seeded data
        const editionInput = await buildEditionInput(db);
        const edition = await generateEdition(ai, editionInput);

        // Backfill editions from last Monday through today (inclusive)
        const today = new Date();
        const dayOfWeek = today.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
        const diffToMonday = (dayOfWeek + 6) % 7; // 0 if Monday, 6 if Sunday

        const monday = new Date(today);
        monday.setUTCDate(today.getUTCDate() - diffToMonday);

        for (
          let d = new Date(monday);
          d <= today;
          d.setUTCDate(d.getUTCDate() + 1)
        ) {
          const editionDate = d.toISOString().slice(0, 10);
          await db.insertDailyEdition(editionDate, JSON.stringify(edition));
        }

        return Response.json({
          success: true,
          message: clean
            ? "Database cleaned, reinitialized and seeded"
            : "Database initialized and seeded"
        });
      } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // API routes
    if (pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, pathname);
    }

    // Page routes
    return handlePageRequest(request, pathname);
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const db = new DatabaseService(env.DB);
    const search = new AISearchService(env.SEARCH);
    await seedMockFeedback(env, db, search);

    const ai = new WorkersAIService(env.AI);
    const detector = new UnderRadarDetector(db, ai);
    await detector.detectUnderRadar();

    if (env.DAILY_NEWSPAPER_WORKFLOW) {
      const editionId = `daily-${new Date().toISOString().slice(0, 10)}`;
      await env.DAILY_NEWSPAPER_WORKFLOW.create({
        id: editionId,
        params: undefined
      });
    }
  }
};
