import Database from 'better-sqlite3';
import path from 'path';

let db = null;

const DEFAULT_DB_PATH = path.join(
  process.env.HOME, '.claude', 'agent-marketplace.db'
);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL DEFAULT '0.0.0',
  source_path TEXT,
  team TEXT,
  model TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  pipeline_phase TEXT,
  prompt_hash TEXT,
  output_hash TEXT,
  output_schema_valid INTEGER,
  schema_score REAL,
  duration_ms INTEGER,
  timestamp TEXT DEFAULT (datetime('now')),
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER REFERENCES executions(id),
  eval_type TEXT NOT NULL,
  score REAL,
  details TEXT,
  evaluator TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_versions (
  agent_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT,
  changelog TEXT,
  avg_score REAL,
  execution_count INTEGER DEFAULT 0,
  released_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, version)
);

CREATE INDEX IF NOT EXISTS idx_executions_agent ON executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
CREATE INDEX IF NOT EXISTS idx_evaluations_execution ON evaluations(execution_id);
`;

export function createDb(dbPath = DEFAULT_DB_PATH) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call createDb() first.');
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
