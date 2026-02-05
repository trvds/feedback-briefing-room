-- Schema for The Feedback Journal D1 database

-- Feedback entries table
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    user_id TEXT,
    metadata TEXT, -- JSON string for additional data
    sentiment_label TEXT,
    sentiment_score REAL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Cases table for grouping related feedback
CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'open', -- open, investigating, resolved, closed
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Many-to-many relationship between cases and feedback
CREATE TABLE IF NOT EXISTS case_feedback (
    case_id INTEGER NOT NULL,
    feedback_id INTEGER NOT NULL,
    PRIMARY KEY (case_id, feedback_id),
    FOREIGN KEY (case_id) REFERENCES cases(id),
    FOREIGN KEY (feedback_id) REFERENCES feedback(id)
);

-- Under-the-radar flags detected by AI analysis
CREATE TABLE IF NOT EXISTS under_radar_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    severity_score REAL NOT NULL,
    reason TEXT NOT NULL,
    detected_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (feedback_id) REFERENCES feedback(id)
);

-- Daily AI-generated newspaper editions
CREATE TABLE IF NOT EXISTS daily_editions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_date TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON feedback(timestamp);
CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source);
CREATE INDEX IF NOT EXISTS idx_under_radar_feedback ON under_radar_flags(feedback_id);
CREATE INDEX IF NOT EXISTS idx_case_feedback_case ON case_feedback(case_id);
CREATE INDEX IF NOT EXISTS idx_case_feedback_feedback ON case_feedback(feedback_id);
CREATE INDEX IF NOT EXISTS idx_daily_editions_date ON daily_editions(edition_date);

