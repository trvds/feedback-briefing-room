export interface SeverityScore {
  score: number;
  reason: string;
}

/**
 * Calculate severity score based on feedback content
 * Higher score = higher severity
 * Looks for keywords indicating production issues, blocking problems, etc.
 */
export function calculateSeverityScore(content: string): SeverityScore {
  const lowerContent = content.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  // Critical keywords
  const criticalKeywords = [
    "urgent", "critical", "production down", "prod down", "incident",
    "blocked", "blocking", "breaking", "broken", "down", "failed",
    "timeout", "error", "bug", "unacceptable"
  ];

  // High severity keywords
  const highKeywords = [
    "issue", "problem", "confusing", "unexpected", "inconsistent",
    "frustrated", "disappointed", "concerned"
  ];

  // Check for critical keywords
  const criticalMatches = criticalKeywords.filter(keyword =>
    lowerContent.includes(keyword)
  );
  if (criticalMatches.length > 0) {
    score += criticalMatches.length * 3;
    reasons.push(`Critical keywords detected: ${criticalMatches.join(", ")}`);
  }

  // Check for high severity keywords
  const highMatches = highKeywords.filter(keyword =>
    lowerContent.includes(keyword)
  );
  if (highMatches.length > 0) {
    score += highMatches.length * 1;
    reasons.push(`High-severity keywords: ${highMatches.join(", ")}`);
  }

  // Check for mentions of production/customers/users
  if (lowerContent.includes("production") || lowerContent.includes("prod")) {
    score += 2;
    reasons.push("Production environment mentioned");
  }

  if (lowerContent.includes("customer") || lowerContent.includes("user")) {
    score += 1;
    reasons.push("Customer/user impact mentioned");
  }

  // Check for numbers indicating scale
  const numberMatches = lowerContent.match(/\d+k|\d+,\d+|\d{4,}/g);
  if (numberMatches) {
    score += 1;
    reasons.push(`Scale indicators found: ${numberMatches.join(", ")}`);
  }

  // Check for emotional language
  if (lowerContent.includes("!") && lowerContent.split("!").length > 2) {
    score += 1;
    reasons.push("Strong emotional language detected");
  }

  return {
    score: Math.min(score, 10), // Cap at 10
    reason: reasons.join("; ") || "Normal feedback"
  };
}

/**
 * Determine if feedback is "flying under the radar" (high severity, low volume)
 * Under the radar = severity score >= 5
 */
export function isUnderRadar(severityScore: number, volume: number = 1): boolean {
  return severityScore >= 5 && volume <= 3;
}
