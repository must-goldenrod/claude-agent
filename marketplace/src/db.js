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
  output_length INTEGER,
  token_estimate INTEGER,
  call_order INTEGER,
  project_type TEXT,
  model_version TEXT,
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

CREATE TABLE IF NOT EXISTS agent_profiles (
  agent_id TEXT PRIMARY KEY,
  quality_score REAL,
  efficiency_score REAL,
  reliability_score REAL,
  impact_score REAL,
  composite_score REAL,
  sample_size INTEGER,
  period_start TEXT,
  period_end TEXT,
  context TEXT,
  calculated_at TEXT DEFAULT (datetime('now')),
  quality_details TEXT,
  efficiency_details TEXT,
  reliability_details TEXT,
  impact_details TEXT
);

CREATE TABLE IF NOT EXISTS profile_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  quality_score REAL,
  efficiency_score REAL,
  reliability_score REAL,
  impact_score REAL,
  composite_score REAL,
  sample_size INTEGER,
  snapshot_date TEXT DEFAULT (datetime('now')),
  context TEXT
);

CREATE TABLE IF NOT EXISTS publisher_profiles (
  agent_id TEXT PRIMARY KEY,
  publisher_quality REAL,
  publisher_efficiency REAL,
  publisher_reliability REAL,
  publisher_impact REAL,
  publisher_composite REAL,
  publisher_sample_size INTEGER,
  publisher_context JSON,
  installed_at TEXT DEFAULT (datetime('now')),
  meta_json JSON
);

CREATE INDEX IF NOT EXISTS idx_executions_agent ON executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
CREATE INDEX IF NOT EXISTS idx_evaluations_execution ON evaluations(execution_id);
CREATE INDEX IF NOT EXISTS idx_profile_history_agent ON profile_history(agent_id);
`;

export function createDb(dbPath = DEFAULT_DB_PATH) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Migrate existing DBs: add columns that may not exist
  const cols = db.prepare("PRAGMA table_info(executions)").all().map(c => c.name);
  if (!cols.includes('output_length')) {
    db.exec('ALTER TABLE executions ADD COLUMN output_length INTEGER');
    db.exec('ALTER TABLE executions ADD COLUMN token_estimate INTEGER');
    db.exec('ALTER TABLE executions ADD COLUMN call_order INTEGER');
    db.exec('ALTER TABLE executions ADD COLUMN project_type TEXT');
    db.exec('ALTER TABLE executions ADD COLUMN model_version TEXT');
  }

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
