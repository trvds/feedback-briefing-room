export interface NewsroomEdition {
  topStory: { headline: string; body: string; feedbackId?: number };
  breakingIssues: Array<{ title: string; excerpt: string; feedbackId?: number }>;
  underRadar: Array<{ excerpt: string; severity: number; reason: string; feedbackId?: number }>;
  developerExperience: Array<{ title: string; excerpt: string; feedbackId?: number }>;
  pricingLimits: Array<{ title: string; excerpt: string; feedbackId?: number }>;
  falseAlarms: Array<{ title: string; excerpt: string; feedbackId?: number }>;
}

export interface AIService {
  analyzeSentiment(content: string): Promise<{ sentiment: string; score: number }>;
  summarizeFeedback(feedbackItems: string[]): Promise<string>;
  detectUnderRadar(content: string, context?: string): Promise<{ isUnderRadar: boolean; reason: string; severity: number }>;
  generateVerdict(prosecution: string, defense: string): Promise<{ verdict: string; urgency: string; suggestedAction: string }>;
  generateNewsroomEdition(data: { casesSummary: string; underRadarSummary: string; recentFeedbackSummary: string }): Promise<NewsroomEdition>;
}

/**
 * Cleans AI response text by removing markdown code blocks and extracting JSON
 * Handles cases where AI wraps JSON in ```json ... ``` blocks
 */
function cleanAIResponse(responseText: string): string {
  if (typeof responseText !== 'string') {
    return String(responseText);
  }

  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  let cleaned = responseText.trim();

  // Match markdown code blocks with optional language identifier
  // Use non-greedy match to handle multiple code blocks
  const codeBlockRegex = /```(?:json)?\s*\n?(.*?)\n?```/gs;
  const match = codeBlockRegex.exec(cleaned);

  if (match && match[1]) {
    // Extract content from code block
    cleaned = match[1].trim();
  } else {
    // If no code block, try to find JSON object/array in the text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  // Remove any leading text before the first { or [
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    cleaned = cleaned.substring(firstBrace);
  } else if (firstBracket !== -1) {
    cleaned = cleaned.substring(firstBracket);
  }

  // Try to find matching closing brace/bracket
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');

  // If we have a complete JSON object/array, extract it
  if (cleaned.startsWith('{') && lastBrace > 0) {
    cleaned = cleaned.substring(0, lastBrace + 1);
  } else if (cleaned.startsWith('[') && lastBracket > 0) {
    cleaned = cleaned.substring(0, lastBracket + 1);
  }
  // If incomplete JSON (missing closing brace), keep what we have
  // The fallback parsing will handle extracting fields

  return cleaned.trim();
}

export class WorkersAIService implements AIService {
  constructor(private ai: any) { }

  async analyzeSentiment(content: string): Promise<{ sentiment: string; score: number }> {
    try {
      const prompt = `Analyze the sentiment of this feedback. Respond with JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
      const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: content }
        ],
        max_tokens: 100
      });

      // Handle different response formats
      const rawResponse = response.response || response || JSON.stringify({ sentiment: "neutral", score: 0.5 });
      const responseText = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse);
      const cleanedText = cleanAIResponse(responseText);

      let result;
      try {
        result = JSON.parse(cleanedText);
      } catch {
        // If not JSON, try to extract sentiment from text
        const lower = cleanedText.toLowerCase();
        result = {
          sentiment: lower.includes('positive') ? 'positive' : lower.includes('negative') ? 'negative' : 'neutral',
          score: lower.includes('positive') ? 0.7 : lower.includes('negative') ? 0.3 : 0.5
        };
      }

      return {
        sentiment: result.sentiment || "neutral",
        score: result.score || 0.5
      };
    } catch (error) {
      console.error("Sentiment analysis error:", error);
      return { sentiment: "neutral", score: 0.5 };
    }
  }

  async summarizeFeedback(feedbackItems: string[]): Promise<string> {
    try {
      const combinedFeedback = feedbackItems.join("\n\n---\n\n");
      const prompt = `Summarize the following customer feedback into a concise 2-3 sentence summary. Focus on the main issue or theme:`;

      const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: combinedFeedback }
        ],
        max_tokens: 200
      });

      return response.response || response || "Unable to generate summary";
    } catch (error) {
      console.error("Summarization error:", error);
      return "Error generating summary";
    }
  }

  async detectUnderRadar(content: string, context?: string): Promise<{ isUnderRadar: boolean; reason: string; severity: number }> {
    try {
      const prompt = `Analyze this feedback to determine if it represents items "flying under the radar" - high-severity issues that might be overlooked due to low volume. 
Under the radar indicators: production issues, blocking problems, critical bugs, customer impact, urgent language.
Respond with JSON: {"isUnderRadar": true/false, "reason": "explanation", "severity": 1-10}`;

      const userContent = context ? `${content}\n\nContext: ${context}` : content;

      const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userContent }
        ],
        max_tokens: 150
      });

      const rawResponse = response.response || response || JSON.stringify({ isUnderRadar: false, reason: "Normal feedback", severity: 3 });
      const responseText = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse);
      const cleanedText = cleanAIResponse(responseText);

      let result;
      try {
        result = JSON.parse(cleanedText);
      } catch {
        // Fallback parsing - extract fields from malformed JSON
        const lower = cleanedText.toLowerCase();

        // Try to extract JSON fields using regex
        const reasonMatch = cleanedText.match(/["']reason["']\s*:\s*["']([^"']+)["']/i) ||
          cleanedText.match(/reason["\s:]*"([^"]+)"/i);
        const severityMatch = cleanedText.match(/["']severity["']\s*:\s*(\d+)/i) ||
          cleanedText.match(/severity["\s:]*(\d+)/i);
        const isUnderRadarMatch = cleanedText.match(/["']isUnderRadar["']\s*:\s*(true|false)/i) ||
          cleanedText.match(/isunderradar["\s:]*true/i);

        const extractedReason = reasonMatch ? reasonMatch[1] : null;
        const extractedSeverity = severityMatch ? parseInt(severityMatch[1]) : null;
        const extractedIsUnderRadar = isUnderRadarMatch ? isUnderRadarMatch[1] === 'true' || isUnderRadarMatch[0].toLowerCase().includes('true') : null;

        result = {
          isUnderRadar: extractedIsUnderRadar !== null ? extractedIsUnderRadar :
            (lower.includes('under the radar') || lower.includes('high-severity') || lower.includes('overlooked')),
          reason: extractedReason || cleanedText.replace(/```json|```|[{}\[\]]/g, '').trim().substring(0, 200) || "High-severity issue detected",
          severity: extractedSeverity !== null ? extractedSeverity :
            (lower.includes('critical') ? 9 : lower.includes('high') ? 7 : 3)
        };
      }

      return {
        isUnderRadar: result.isUnderRadar || false,
        reason: result.reason || "Normal feedback",
        severity: result.severity || 3
      };
    } catch (error) {
      console.error("Under radar detection error:", error);
      return { isUnderRadar: false, reason: "Error analyzing", severity: 3 };
    }
  }

  async generateVerdict(prosecution: string, defense: string): Promise<{ verdict: string; urgency: string; suggestedAction: string }> {
    try {
      const prompt = `You are a product manager evaluating feedback. 
Prosecution (customer complaints): ${prosecution}
Defense (counterpoints): ${defense}

Provide a verdict as JSON: {"verdict": "your assessment", "urgency": "low|medium|high|critical", "suggestedAction": "what to do next"}`;

      const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Generate the verdict." }
        ],
        max_tokens: 300
      });

      const rawResponse = response.response || response || JSON.stringify({ verdict: "Needs investigation", urgency: "medium", suggestedAction: "Review feedback" });
      const responseText = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse);
      const cleanedText = cleanAIResponse(responseText);

      let result;
      try {
        result = JSON.parse(cleanedText);
      } catch {
        // Fallback parsing
        const lower = cleanedText.toLowerCase();
        // Extract verdict text, avoiding markdown artifacts
        const verdictText = cleanedText.replace(/```json|```/g, '').trim();
        result = {
          verdict: verdictText.substring(0, 300).replace(/^[^{]*\{/, '').replace(/\}[^}]*$/, '').trim() || "Needs investigation",
          urgency: lower.includes('critical') ? 'critical' : lower.includes('high') ? 'high' : lower.includes('low') ? 'low' : 'medium',
          suggestedAction: lower.includes('suggestedaction') || lower.includes('suggested_action') ?
            (cleanedText.match(/suggestedaction["\s:]*"([^"]+)"/i)?.[1] || "Review feedback and take appropriate action") :
            "Review feedback and take appropriate action"
        };
      }

      return {
        verdict: result.verdict || "Needs investigation",
        urgency: result.urgency || "medium",
        suggestedAction: result.suggestedAction || "Review feedback"
      };
    } catch (error) {
      console.error("Verdict generation error:", error);
      return {
        verdict: "Unable to generate verdict",
        urgency: "medium",
        suggestedAction: "Manual review required"
      };
    }
  }

  async generateNewsroomEdition(data: {
    casesSummary: string;
    underRadarSummary: string;
    recentFeedbackSummary: string;
  }): Promise<NewsroomEdition> {
    try {
      const prompt = `You are writing the daily Feedback Journal. Based on the following data, produce a newspaper edition as JSON.

Cases/bundled feedback summary:
${data.casesSummary}

Under-the-radar (high-severity, low-volume) feedback:
${data.underRadarSummary}

Recent feedback summary:
${data.recentFeedbackSummary}

Respond with ONLY a JSON object (no markdown) with this exact structure:
{
  "topStory": { "headline": "string", "body": "string", "feedbackId": number or null },
  "breakingIssues": [ { "title": "string", "excerpt": "string", "feedbackId": number or null } ],
  "underRadar": [ { "excerpt": "string", "severity": number, "reason": "string", "feedbackId": number or null } ],
  "developerExperience": [ { "title": "string", "excerpt": "string", "feedbackId": number or null } ],
  "pricingLimits": [ { "title": "string", "excerpt": "string", "feedbackId": number or null } ],
  "falseAlarms": [ { "title": "string", "excerpt": "string", "feedbackId": number or null } ]
}
Use empty arrays where no items. Keep excerpts under 200 chars.`;

      const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Generate the edition JSON." }
        ],
        max_tokens: 2000
      });

      const rawResponse = response.response || response || "{}";
      const responseText = typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);
      const cleanedText = cleanAIResponse(responseText);
      const parsed = JSON.parse(cleanedText);

      return {
        topStory: parsed.topStory || { headline: "No top story", body: "", feedbackId: undefined },
        breakingIssues: Array.isArray(parsed.breakingIssues) ? parsed.breakingIssues : [],
        underRadar: Array.isArray(parsed.underRadar) ? parsed.underRadar : [],
        developerExperience: Array.isArray(parsed.developerExperience) ? parsed.developerExperience : [],
        pricingLimits: Array.isArray(parsed.pricingLimits) ? parsed.pricingLimits : [],
        falseAlarms: Array.isArray(parsed.falseAlarms) ? parsed.falseAlarms : []
      };
    } catch (error) {
      console.error("Newsroom edition generation error:", error);
      return {
        topStory: { headline: "Edition unavailable", body: "AI could not generate today's edition.", feedbackId: undefined },
        breakingIssues: [],
        underRadar: [],
        developerExperience: [],
        pricingLimits: [],
        falseAlarms: []
      };
    }
  }
}
