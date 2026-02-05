import { DatabaseService } from "../services/database";
import { WorkersAIService } from "../services/ai";
import { AISearchService } from "../services/search";
import { calculateSeverityScore } from "../utils/scoring";

export interface Env {
  DB: D1Database;
  AI: any;
  SEARCH: any;
  FEEDBACK_WORKFLOW?: {
    create(options?: { id?: string; params?: unknown }): Promise<{ id: string }>;
  };
  DAILY_NEWSPAPER_WORKFLOW?: {
    create(options?: { id?: string; params?: unknown }): Promise<{ id: string }>;
  };
}

export async function handleApiRequest(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const db = new DatabaseService(env.DB);
  const ai = new WorkersAIService(env.AI);
  const search = new AISearchService(env.SEARCH);

  const url = new URL(request.url);
  const method = request.method;

  // GET /api/feedback
  if (pathname === "/api/feedback" && method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const source = url.searchParams.get("source");

    let feedback;
    if (source) {
      feedback = await db.getFeedbackBySource(source, limit);
    } else {
      feedback = await db.getAllFeedback(limit, offset);
    }

    return Response.json({ feedback });
  }

  // GET /api/feedback/:id
  if (pathname.match(/^\/api\/feedback\/(\d+)$/) && method === "GET") {
    const match = pathname.match(/^\/api\/feedback\/(\d+)$/);
    const id = parseInt(match![1]);
    const feedback = await db.getFeedbackById(id);

    if (!feedback) {
      return Response.json({ error: "Feedback not found" }, { status: 404 });
    }

    return Response.json({ feedback });
  }

  // GET /api/under-radar
  if (pathname === "/api/under-radar" && method === "GET") {
    const flags = await db.getUnderRadarFlags();
    return Response.json({ underRadar: flags });
  }

  // GET /api/edition/latest
  if (pathname === "/api/edition/latest" && method === "GET") {
    const edition = await db.getLatestDailyEdition();
    if (!edition) {
      return Response.json({ edition: null }, { status: 200 });
    }
    let content: unknown;
    try {
      content = JSON.parse(edition.content);
    } catch {
      content = { raw: edition.content };
    }
    return Response.json({
      edition_date: edition.edition_date,
      created_at: edition.created_at,
      content
    });
  }

  // GET /api/edition/:date
  if (pathname.match(/^\/api\/edition\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/) && method === "GET") {
    const match = pathname.match(/^\/api\/edition\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
    const editionDate = match![1];
    const edition = await db.getDailyEditionByDate(editionDate);
    if (!edition) {
      return Response.json({ error: "Edition not found" }, { status: 404 });
    }
    let content: unknown;
    try {
      content = JSON.parse(edition.content);
    } catch {
      content = { raw: edition.content };
    }
    return Response.json({
      edition_date: edition.edition_date,
      created_at: edition.created_at,
      content
    });
  }

  // GET /api/editions (list recent editions)
  if (pathname === "/api/editions" && method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") || "30");
    const editions = await db.getRecentDailyEditions(isNaN(limit) ? 30 : limit);
    return Response.json({ editions });
  }

  // GET /api/cases
  if (pathname === "/api/cases" && method === "GET") {
    const cases = await db.getAllCases();
    return Response.json({ cases });
  }

  // GET /api/cases/:id
  if (pathname.match(/^\/api\/cases\/(\d+)$/) && method === "GET") {
    const match = pathname.match(/^\/api\/cases\/(\d+)$/);
    const caseId = parseInt(match![1]);

    const caseData = await db.getCaseById(caseId);
    if (!caseData) {
      return Response.json({ error: "Case not found" }, { status: 404 });
    }

    const feedback = await db.getFeedbackForCase(caseId);

    // Generate prosecution summary (angry feedback)
    const negativeFeedback = feedback.filter(f => {
      const score = calculateSeverityScore(f.content);
      return score.score >= 5;
    });

    let prosecution = "No critical feedback found.";
    if (negativeFeedback.length > 0) {
      prosecution = await ai.summarizeFeedback(
        negativeFeedback.map(f => f.content)
      );
    }

    // Generate defense (counterpoints)
    const defense = `Total feedback: ${feedback.length} items. 
${negativeFeedback.length} items flagged as high-severity.
Most feedback is from: ${feedback.length > 0 ? feedback[0].source : "unknown"} source.
Consider: This might be expected behavior or user error.`;

    // Generate verdict
    const verdict = await ai.generateVerdict(prosecution, defense);

    return Response.json({
      case: caseData,
      feedback,
      prosecution,
      defense,
      verdict
    });
  }

  // POST /api/analyze
  if (pathname === "/api/analyze" && method === "POST") {
    try {
      const body = await request.json();
      const { feedbackId } = body;

      if (!feedbackId) {
        return Response.json({ error: "feedbackId required" }, { status: 400 });
      }

      const feedback = await db.getFeedbackById(feedbackId);
      if (!feedback) {
        return Response.json({ error: "Feedback not found" }, { status: 404 });
      }

      // Check if already flagged
      const existingFlag = await db.getUnderRadarFlagByFeedbackId(feedbackId);
      if (existingFlag) {
        return Response.json({
          flagged: true,
          flag: existingFlag,
          feedback
        });
      }

      // Analyze with AI
      const analysis = await ai.detectUnderRadar(feedback.content);
      const severityScore = calculateSeverityScore(feedback.content);

      // If AI detects under radar or severity score is high, flag it
      if (analysis.isUnderRadar || severityScore.score >= 5) {
        const flag = await db.insertUnderRadarFlag({
          feedback_id: feedbackId,
          severity_score: Math.max(analysis.severity, severityScore.score),
          reason: `${analysis.reason}. ${severityScore.reason}`
        });

        return Response.json({
          flagged: true,
          flag: { id: flag, ...analysis, severityScore },
          feedback
        });
      }

      return Response.json({
        flagged: false,
        analysis,
        severityScore,
        feedback
      });
    } catch (error) {
      return Response.json({ error: "Analysis failed" }, { status: 500 });
    }
  }

  // POST /api/feedback (for seeding mock data)
  if (pathname === "/api/feedback" && method === "POST") {
    try {
      const body = await request.json();
      const { source, content, timestamp, user_id, metadata } = body;

      if (!source || !content || !timestamp) {
        return Response.json(
          { error: "source, content, and timestamp required" },
          { status: 400 }
        );
      }

      const feedbackId = await db.insertFeedback({
        source,
        content,
        timestamp,
        user_id,
        metadata
      });

      // Index for search
      await search.indexFeedback(feedbackId, content, { source, timestamp });

      let workflowInstanceId: string | undefined;
      if (env.FEEDBACK_WORKFLOW) {
        try {
          const instance = await env.FEEDBACK_WORKFLOW.create({
            id: `feedback-${feedbackId}`,
            params: { feedbackId, source, content, timestamp, user_id, metadata }
          });
          workflowInstanceId = instance.id;
        } catch (_) {
          // Idempotent: instance may already exist
        }
      }

      return Response.json({
        id: feedbackId,
        success: true,
        ...(workflowInstanceId && { workflowInstanceId })
      });
    } catch (error) {
      return Response.json({ error: "Failed to insert feedback" }, { status: 500 });
    }
  }

  // POST /api/cases
  if (pathname === "/api/cases" && method === "POST") {
    try {
      const body = await request.json();
      const { title, feedbackIds, includeSimilar, similarLimit } = body;

      if (!title) {
        return Response.json({ error: "title required" }, { status: 400 });
      }

      let idsToLink: number[] = Array.isArray(feedbackIds) ? feedbackIds.map((id: unknown) => Number(id)).filter((id: number) => !isNaN(id)) : [];

      // Expand with similar feedback when requested and exactly one seed ID
      if (includeSimilar && idsToLink.length === 1) {
        const seedId = idsToLink[0];
        const feedback = await db.getFeedbackById(seedId);
        if (feedback?.content) {
          const limit = typeof similarLimit === "number" && similarLimit > 0 ? similarLimit : 10;
          const similar = await search.findSimilarFeedback(feedback.content, limit);
          const similarIds = similar
            .map((r) => parseInt(r.id, 10))
            .filter((id) => !isNaN(id) && id > 0);
          const deduped = Array.from(new Set([seedId, ...similarIds]));
          idsToLink = deduped;
        }
      }

      const caseId = await db.createCase({ title, status: "open" });

      for (const feedbackId of idsToLink) {
        await db.linkFeedbackToCase(caseId, feedbackId);
      }

      return Response.json({ id: caseId, success: true });
    } catch (error) {
      return Response.json({ error: "Failed to create case" }, { status: 500 });
    }
  }

  // POST /api/edition/regenerate - manually trigger today's newspaper workflow
  if (pathname === "/api/edition/regenerate" && method === "POST") {
    if (!env.DAILY_NEWSPAPER_WORKFLOW) {
      return Response.json(
        { error: "Daily newspaper workflow is not configured" },
        { status: 500 }
      );
    }

    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      // Use a unique instance id so we can rerun multiple times in a day
      const instanceId = `daily-${today}-${Date.now()}`;

      const instance = await env.DAILY_NEWSPAPER_WORKFLOW.create({
        id: instanceId,
        params: undefined
      });

      return Response.json({
        success: true,
        edition_date: today,
        workflowInstanceId: instance.id
      });
    } catch (error) {
      return Response.json({ error: "Failed to trigger daily edition workflow" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
