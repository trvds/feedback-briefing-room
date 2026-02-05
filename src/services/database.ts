export interface Feedback {
  id?: number;
  source: string;
  content: string;
  timestamp: number;
  user_id?: string;
  metadata?: string;
  sentiment_label?: string;
  sentiment_score?: number;
  created_at?: number;
}

export interface Case {
  id?: number;
  title: string;
  status: string;
  created_at?: number;
  updated_at?: number;
}

export interface UnderRadarFlag {
  id?: number;
  feedback_id: number;
  severity_score: number;
  reason: string;
  detected_at?: number;
}

export class DatabaseService {
  constructor(private db: D1Database) { }

  async insertFeedback(feedback: Feedback): Promise<number> {
    const result = await this.db.prepare(
      `INSERT INTO feedback (source, content, timestamp, user_id, metadata)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      feedback.source,
      feedback.content,
      feedback.timestamp,
      feedback.user_id || null,
      feedback.metadata || null
    ).run();

    return result.meta.last_row_id || 0;
  }

  async getAllFeedback(limit: number = 100, offset: number = 0): Promise<Feedback[]> {
    const result = await this.db.prepare(
      `SELECT * FROM feedback ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();

    return result.results as Feedback[];
  }

  async getFeedbackById(id: number): Promise<Feedback | null> {
    const result = await this.db.prepare(
      `SELECT * FROM feedback WHERE id = ?`
    ).bind(id).first();

    return result as Feedback | null;
  }

  async getFeedbackBySource(source: string, limit: number = 50): Promise<Feedback[]> {
    const result = await this.db.prepare(
      `SELECT * FROM feedback WHERE source = ? ORDER BY timestamp DESC LIMIT ?`
    ).bind(source, limit).all();

    return result.results as Feedback[];
  }

  async createCase(caseData: Case): Promise<number> {
    const result = await this.db.prepare(
      `INSERT INTO cases (title, status) VALUES (?, ?)`
    ).bind(caseData.title, caseData.status || "open").run();

    return result.meta.last_row_id || 0;
  }

  async getCaseById(id: number): Promise<Case | null> {
    const result = await this.db.prepare(
      `SELECT * FROM cases WHERE id = ?`
    ).bind(id).first();

    return result as Case | null;
  }

  async getAllCases(): Promise<Case[]> {
    const result = await this.db.prepare(
      `SELECT * FROM cases ORDER BY created_at DESC`
    ).all();

    return result.results as Case[];
  }

  async linkFeedbackToCase(caseId: number, feedbackId: number): Promise<void> {
    await this.db.prepare(
      `INSERT OR IGNORE INTO case_feedback (case_id, feedback_id) VALUES (?, ?)`
    ).bind(caseId, feedbackId).run();
  }

  async getFeedbackForCase(caseId: number): Promise<Feedback[]> {
    const result = await this.db.prepare(
      `SELECT f.* FROM feedback f
       INNER JOIN case_feedback cf ON f.id = cf.feedback_id
       WHERE cf.case_id = ?
       ORDER BY f.timestamp DESC`
    ).bind(caseId).all();

    return result.results as Feedback[];
  }

  async insertUnderRadarFlag(flag: UnderRadarFlag): Promise<number> {
    const result = await this.db.prepare(
      `INSERT INTO under_radar_flags (feedback_id, severity_score, reason)
       VALUES (?, ?, ?)`
    ).bind(flag.feedback_id, flag.severity_score, flag.reason).run();

    return result.meta.last_row_id || 0;
  }

  async getUnderRadarFlags(): Promise<(UnderRadarFlag & { feedback: Feedback })[]> {
    const result = await this.db.prepare(
      `SELECT spf.*, f.* 
       FROM under_radar_flags spf
       INNER JOIN feedback f ON spf.feedback_id = f.id
       ORDER BY spf.severity_score DESC, spf.detected_at DESC`
    ).all();

    return result.results.map((row: any) => ({
      id: row.id,
      feedback_id: row.feedback_id,
      severity_score: row.severity_score,
      reason: row.reason,
      detected_at: row.detected_at,
      feedback: {
        id: row.feedback_id,
        source: row.source,
        content: row.content,
        timestamp: row.timestamp,
        user_id: row.user_id,
        metadata: row.metadata,
        created_at: row.created_at
      }
    }));
  }

  async getUnderRadarFlagByFeedbackId(feedbackId: number): Promise<UnderRadarFlag | null> {
    const result = await this.db.prepare(
      `SELECT * FROM under_radar_flags WHERE feedback_id = ?`
    ).bind(feedbackId).first();

    return result as UnderRadarFlag | null;
  }

  async updateFeedbackSentiment(id: number, label: string, score: number): Promise<void> {
    await this.db.prepare(
      `UPDATE feedback SET sentiment_label = ?, sentiment_score = ? WHERE id = ?`
    ).bind(label, score, id).run();
  }

  async getCaseIdsByFeedbackId(feedbackId: number): Promise<number[]> {
    const result = await this.db.prepare(
      `SELECT case_id FROM case_feedback WHERE feedback_id = ?`
    ).bind(feedbackId).all();
    return (result.results as { case_id: number }[]).map((r) => r.case_id);
  }

  async insertDailyEdition(editionDate: string, content: string): Promise<number> {
    await this.db.prepare(`DELETE FROM daily_editions WHERE edition_date = ?`).bind(editionDate).run();
    const result = await this.db.prepare(
      `INSERT INTO daily_editions (edition_date, content) VALUES (?, ?)`
    ).bind(editionDate, content).run();
    return result.meta.last_row_id || 0;
  }

  async getLatestDailyEdition(): Promise<{ edition_date: string; content: string; created_at: number } | null> {
    const result = await this.db.prepare(
      `SELECT edition_date, content, created_at FROM daily_editions ORDER BY created_at DESC LIMIT 1`
    ).first();
    return result as { edition_date: string; content: string; created_at: number } | null;
  }

  async getDailyEditionByDate(editionDate: string): Promise<{ edition_date: string; content: string; created_at: number } | null> {
    const result = await this.db.prepare(
      `SELECT edition_date, content, created_at FROM daily_editions WHERE edition_date = ?`
    ).bind(editionDate).first();
    return result as { edition_date: string; content: string; created_at: number } | null;
  }

  async getRecentDailyEditions(limit: number = 30): Promise<{ edition_date: string; created_at: number }[]> {
    const result = await this.db.prepare(
      `SELECT edition_date, created_at FROM daily_editions ORDER BY edition_date DESC LIMIT ?`
    ).bind(limit).all();
    return (result.results as { edition_date: string; created_at: number }[]) || [];
  }

  async cleanDatabase(): Promise<void> {
    // Delete in order to respect foreign key constraints
    await this.db.prepare(`DELETE FROM daily_editions`).run();
    await this.db.prepare(`DELETE FROM case_feedback`).run();
    await this.db.prepare(`DELETE FROM under_radar_flags`).run();
    await this.db.prepare(`DELETE FROM cases`).run();
    await this.db.prepare(`DELETE FROM feedback`).run();
  }

  async initializeSchema(): Promise<void> {
    // This would typically be done via migrations, but useful for dev
    const schema = `
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        user_id TEXT,
        metadata TEXT,
        sentiment_label TEXT,
        sentiment_score REAL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE TABLE IF NOT EXISTS cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE TABLE IF NOT EXISTS case_feedback (
        case_id INTEGER NOT NULL,
        feedback_id INTEGER NOT NULL,
        PRIMARY KEY (case_id, feedback_id),
        FOREIGN KEY (case_id) REFERENCES cases(id),
        FOREIGN KEY (feedback_id) REFERENCES feedback(id)
      );
      
      CREATE TABLE IF NOT EXISTS under_radar_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feedback_id INTEGER NOT NULL,
        severity_score REAL NOT NULL,
        reason TEXT NOT NULL,
        detected_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (feedback_id) REFERENCES feedback(id)
      );

      CREATE TABLE IF NOT EXISTS daily_editions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        edition_date TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `;

    // Split and execute each statement
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await this.db.prepare(statement.trim()).run();
      }
    }
  }
}
