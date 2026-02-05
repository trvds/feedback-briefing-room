import { DatabaseService } from "./database";
import { WorkersAIService, NewsroomEdition } from "./ai";

export interface EditionInput {
  casesSummary: string;
  underRadarSummary: string;
  recentFeedbackSummary: string;
}

export async function buildEditionInput(db: DatabaseService): Promise<EditionInput> {
  const cases = await db.getAllCases();
  const casesSummaryParts: string[] = [];

  for (const c of cases.slice(0, 20)) {
    const feedback = await db.getFeedbackForCase(c.id!);
    const excerpts = feedback
      .slice(0, 5)
      .map((f) => `[${f.id}] ${f.content.substring(0, 150)}...`);
    casesSummaryParts.push(`Case #${c.id} "${c.title}": ${excerpts.join(" | ")}`);
  }

  const underRadar = await db.getUnderRadarFlags();
  const underRadarSummary =
    underRadar.length === 0
      ? "None"
      : underRadar
        .slice(0, 15)
        .map(
          (f) =>
            `[${f.feedback_id}] severity ${f.severity_score}: ${f.reason} — "${(f.feedback.content || "").substring(0, 100)}..."`,
        )
        .join("\n");

  const recentFeedback = await db.getAllFeedback(50, 0);
  const recentFeedbackSummary =
    recentFeedback.length === 0
      ? "No recent feedback"
      : recentFeedback
        .slice(0, 20)
        .map((f) => `[${f.id}] ${f.source}: ${f.content.substring(0, 120)}...`)
        .join("\n");

  return {
    casesSummary: casesSummaryParts.join("\n") || "No cases yet.",
    underRadarSummary,
    recentFeedbackSummary,
  };
}

export async function generateEdition(
  ai: WorkersAIService,
  input: EditionInput,
): Promise<NewsroomEdition> {
  return ai.generateNewsroomEdition(input);
}

