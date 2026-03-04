use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use anyhow::Result;
use rusqlite::{Connection, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use chrono::Utc;

// ─── App State ────────────────────────────────────────────────────────────────

pub struct AppState {
    pub db_path: Mutex<Option<PathBuf>>,
    pub conn:    Mutex<Option<Connection>>,
}

fn lock_state<T>(m: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>, String> {
    m.lock().map_err(|e| format!("[ContikPro] State lock error: {}", e))
}


impl AppState {
    pub fn new() -> Self {
        AppState {
            db_path: Mutex::new(None),
            conn:    Mutex::new(None),
        }
    }
}

// ─── DB Schema ────────────────────────────────────────────────────────────────
// PRAGMAs are applied separately in open_db() BEFORE schema runs.
// SCHEMA_SQL is purely DDL — idempotent CREATE IF NOT EXISTS statements.

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS settings (
    id         TEXT PRIMARY KEY DEFAULT 'default',
    data       TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS contacts (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    type       TEXT NOT NULL,
    name       TEXT NOT NULL,
    nif        TEXT,
    email      TEXT,
    phone      TEXT,
    active     INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE TABLE IF NOT EXISTS items (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    name       TEXT NOT NULL,
    sku        TEXT,
    category   TEXT,
    active     INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS templates (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    type       TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE TABLE IF NOT EXISTS quotes (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    contact_id TEXT,
    status     TEXT,
    date       INTEGER,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_date   ON quotes(date);
CREATE TABLE IF NOT EXISTS recurring_quotes (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    name       TEXT,
    active     INTEGER DEFAULT 1,
    next_run   INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS invoices (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    contact_id TEXT,
    status     TEXT,
    date       INTEGER,
    quote_id   TEXT,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date   ON invoices(date);
CREATE TABLE IF NOT EXISTS recurring_invoices (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    name       TEXT,
    active     INTEGER DEFAULT 1,
    next_run   INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS expenses (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    supplier_id TEXT,
    category    TEXT,
    date        INTEGER,
    created_at  INTEGER,
    updated_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE TABLE IF NOT EXISTS payments (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    invoice_id TEXT,
    date       INTEGER,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS communications (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    contact_id TEXT,
    type       TEXT,
    status     TEXT,
    date       INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS inbox_threads (
    id              TEXT PRIMARY KEY,
    data            TEXT NOT NULL,
    party_id        TEXT,
    party_type      TEXT,
    last_message_at INTEGER,
    updated_at      INTEGER
);
CREATE TABLE IF NOT EXISTS inbox_messages (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    thread_id  TEXT,
    channel    TEXT,
    status     TEXT,
    created_at INTEGER,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS inbox_templates (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    name       TEXT,
    channel    TEXT,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS email_templates (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    name       TEXT,
    updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS counters (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER
);
-- Schema version tracking for safe future migrations
-- version 0 = no schema_meta table yet (triggers first migration)
-- version N = all migrations up to N have been applied
CREATE TABLE IF NOT EXISTS schema_meta (
    id      INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
    version INTEGER NOT NULL DEFAULT 0,
    applied_at INTEGER
);
INSERT OR IGNORE INTO settings (id, data) VALUES ('default', '{}');
"#;

// ─── Serialization helpers ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DataPathInfo {
    pub path:            String,
    pub db_path:         String,
    pub initialized:     bool,
    /// true if DB was corrupt and auto-recovered from a backup
    pub recovered:       bool,
    /// path of the backup used for auto-recovery
    pub recovery_source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IntegrityResult {
    pub ok:              bool,
    pub detail:          String,
    pub recovered:       bool,
    pub recovery_source: Option<String>,
}

// ─── Phase 5 — Schema versioning and migration system ────────────────────────
//
// CURRENT_SCHEMA_VERSION must be incremented whenever a new migration block
// is added to run_migrations() below. Never decrement.
//
// Migration history:
//   1 — Initial schema: all base tables + schema_meta
//   (future: 2 — add foo column, etc.)
//
// ALIGNMENT RULE: Keep in sync with:
//   src/version.ts  → SCHEMA_VERSION = 1
//   package.json    → version
const CURRENT_SCHEMA_VERSION: i64 = 1;

/// Read the current schema version from the DB.
/// Returns 0 if schema_meta is empty (freshly created DB where INSERT OR IGNORE
/// has not yet populated the row — we'll seed it in run_migrations).
fn get_schema_version(conn: &Connection) -> Result<i64> {
    // schema_meta is always created by SCHEMA_SQL (CREATE IF NOT EXISTS).
    // If the INSERT OR IGNORE didn't fire yet, query returns 0 via unwrap_or.
    let version: i64 = conn
        .query_row(
            "SELECT version FROM schema_meta WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(version)
}

/// Run all pending migrations up to CURRENT_SCHEMA_VERSION.
///
/// Each migration block is:
///   - Idempotent (guarded by `if current_version < N`)
///   - Wrapped in an IMMEDIATE transaction
///   - Followed by a version bump in schema_meta
///
/// Adding a new migration:
///   1. Add an `if current_version < N { ... }` block below
///   2. Increment CURRENT_SCHEMA_VERSION
///   3. Increment SCHEMA_VERSION in src/version.ts
fn run_migrations(conn: &mut Connection) -> Result<()> {
    let mut current_version = get_schema_version(conn)?;
    log::info!("[ContikPro] Schema version: {} (target: {})", current_version, CURRENT_SCHEMA_VERSION);

    if current_version >= CURRENT_SCHEMA_VERSION {
        return Ok(()); // Already up to date
    }

    // ── Migration 1 — Seed schema_meta row (initial schema baseline) ─────────
    // This runs on any DB that was created before schema_meta existed, OR on a
    // fresh DB where the version is 0 (INSERT OR IGNORE produced no row yet).
    if current_version < 1 {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let now = Utc::now().timestamp_millis();
        tx.execute(
            "INSERT OR REPLACE INTO schema_meta (id, version, applied_at) VALUES (1, 1, ?1)",
            params![now],
        )?;
        tx.commit()?;
        current_version = 1;
        log::info!("[ContikPro] Migration 1 applied — schema_meta seeded");
    }

    // ── Add future migrations here ────────────────────────────────────────────
    // Template:
    //
    // if current_version < 2 {
    //     let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    //     tx.execute_batch("ALTER TABLE contacts ADD COLUMN tags TEXT;")?;
    //     tx.execute(
    //         "UPDATE schema_meta SET version = 2, applied_at = ?1 WHERE id = 1",
    //         params![Utc::now().timestamp_millis()],
    //     )?;
    //     tx.commit()?;
    //     current_version = 2;
    //     log::info!("[ContikPro] Migration 2 applied — contacts.tags added");
    // }

    let _ = current_version; // suppress unused warning once there's only migration 1
    Ok(())
}

// ─── Phase 1 — Production-safe DB open ───────────────────────────────────────
// All connections MUST go through open_db(). Sets 5 production PRAGMAs before
// executing schema, ensuring every connection is configured consistently.

fn open_db(path: &PathBuf) -> Result<Connection> {
    let mut conn = Connection::open(path)?;

    // 1. Busy timeout — returns SQLITE_BUSY after 5s instead of immediately,
    //    preventing crashes when two processes briefly contend (e.g. backup tool)
    conn.busy_timeout(Duration::from_millis(5000))?;

    // 2-5. Core production PRAGMAs
    conn.execute_batch("
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous  = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA temp_store   = MEMORY;
        PRAGMA mmap_size    = 134217728;
    ")?;

    // 6. Schema — idempotent CREATE IF NOT EXISTS
    conn.execute_batch(SCHEMA_SQL)?;

    // 7. Phase 5: Run any pending migrations
    run_migrations(&mut conn)?;

    Ok(conn)
}

fn ensure_data_dirs(base: &std::path::Path) -> Result<()> {
    for d in &["backups", "documents", "exports"] {
        fs::create_dir_all(base.join(d))?;
    }
    Ok(())
}

// ─── Phase 2 — Integrity check + auto-recovery ───────────────────────────────

fn run_integrity_check(conn: &Connection) -> Result<String> {
    Ok(conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?)
}

fn find_latest_backup(backups_dir: &PathBuf) -> Option<PathBuf> {
    if !backups_dir.exists() { return None; }
    let mut files: Vec<PathBuf> = fs::read_dir(backups_dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "sqlite").unwrap_or(false))
        .collect();
    files.sort();       // lexicographic == chronological for our timestamp filenames
    files.into_iter().last()
}

fn auto_recover(db_path: &PathBuf, backups_dir: &PathBuf) -> Result<Option<String>> {
    match find_latest_backup(backups_dir) {
        Some(backup) => {
            log::warn!("[ContikPro] Corrupt DB — restoring from: {}", backup.display());
            fs::copy(&backup, db_path)?;
            log::info!("[ContikPro] Auto-recovery complete");
            Ok(Some(backup.to_string_lossy().into_owned()))
        }
        None => {
            log::error!("[ContikPro] Corrupt DB and no backup found — starting fresh");
            Ok(None)
        }
    }
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────
mod commands {
    use super::*;
    use tauri::command;

/// Open or create the data folder, run integrity check, auto-recover if needed.
    #[command]
    pub async fn init_data_folder(
    path:  String,
    state: State<'_, AppState>,
) -> Result<DataPathInfo, String> {
    let base     = PathBuf::from(&path);
    let data_dir = base.join("ContikProData");
    let db_path  = data_dir.join("contikpro.sqlite");

    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    ensure_data_dirs(&data_dir).map_err(|e| e.to_string())?;

    let backups_dir = data_dir.join("backups");
    let mut recovered       = false;
    let mut recovery_source: Option<String> = None;

    let mut conn = open_db(&db_path).map_err(|e| e.to_string())?;

    // Phase 2: integrity check immediately after open
    let integrity = run_integrity_check(&conn).map_err(|e| e.to_string())?;
    if integrity != "ok" {
        log::warn!("[ContikPro] Integrity check failed: {} — starting recovery", integrity);
        drop(conn);  // release file handle before overwriting

        match auto_recover(&db_path, &backups_dir).map_err(|e| e.to_string())? {
            Some(src) => {
                recovered       = true;
                recovery_source = Some(src);
                conn = open_db(&db_path).map_err(|e| e.to_string())?;
            }
            None => {
                // No backup — open fresh (open_db already ran SCHEMA_SQL)
                conn = open_db(&db_path).map_err(|e| e.to_string())?;
            }
        }
    }

    { *lock_state(&state.conn)?    = Some(conn); }
    { *lock_state(&state.db_path)? = Some(db_path.clone()); }


    Ok(DataPathInfo {
        path:        data_dir.to_string_lossy().into_owned(),
        db_path:     db_path.to_string_lossy().into_owned(),
        initialized: true,
        recovered,
        recovery_source,
    })
}

    #[command]
    pub async fn get_data_path(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(lock_state(&state.db_path)?
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned()))
}


/// On-demand integrity check callable from frontend (Settings / diagnostics).
    #[command]
    pub async fn check_db_integrity(
    state: State<'_, AppState>,
) -> Result<IntegrityResult, String> {
    let integrity = {
        let guard = lock_state(&state.conn)?;
        let conn  = guard.as_ref().ok_or("DB not initialized")?;
        run_integrity_check(conn).map_err(|e| e.to_string())?
    };


    if integrity == "ok" {
        return Ok(IntegrityResult { ok: true, detail: "ok".into(), recovered: false, recovery_source: None });
    }

    log::warn!("[ContikPro] check_db_integrity FAIL: {}", integrity);

    let (db_path, backups_dir) = {
        let guard = lock_state(&state.db_path)?;
        let p = guard.as_ref().ok_or("DB path not set")?.clone();
        let b = p.parent()

            .ok_or("DB path has no parent directory")?
            .join("backups");
        (p, b)
    };

    { *lock_state(&state.conn)? = None; }
    let src = auto_recover(&db_path, &backups_dir).map_err(|e| e.to_string())?;
    let conn = open_db(&db_path).map_err(|e| e.to_string())?;
    *lock_state(&state.conn)? = Some(conn);


    Ok(IntegrityResult {
        ok: false,
        detail: integrity,
        recovered: src.is_some(),
        recovery_source: src,
    })
}

/// Generic get.
    #[command]
    pub async fn db_get(
    table: String,
    id:    String,
    state: State<'_, AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let guard = lock_state(&state.conn)?;
    let conn  = guard.as_ref().ok_or("DB not initialized")?;

    let sql   = format!("SELECT data FROM {} WHERE id = ?1", sanitize_table(&table)?);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    match stmt.query_row(params![id], |r| { let d: String = r.get(0)?; Ok(d) }) {
        Ok(s)  => Ok(Some(serde_json::from_str(&s).map_err(|e| e.to_string())?)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Generic put — IMMEDIATE transaction wraps the upsert.
    #[command]
    pub async fn db_put(
    table: String,
    id:    String,
    data:  serde_json::Value,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let mut guard = lock_state(&state.conn)?;
    let conn      = guard.as_mut().ok_or("DB not initialized")?;

    let (sql, params_vec) = build_put_sql(&table, &data)?;

    // Phase 1: IMMEDIATE transaction — blocks other writers, never leaves partial writes
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    tx.execute(&sql, rusqlite::params_from_iter(params_vec.iter().map(AsRef::as_ref)))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(id)
}

/// Generic query.
    #[command]
    pub async fn db_query(
    table:    String,
    filter:   Option<serde_json::Value>,
    order_by: Option<String>,
    limit:    Option<i64>,
    state:    State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let guard = lock_state(&state.conn)?;
    let conn  = guard.as_ref().ok_or("DB not initialized")?;

    let t     = sanitize_table(&table)?;

    let mut sql        = format!("SELECT data FROM {}", t);
    let mut where_parts: Vec<String>               = vec![];
    let mut bind_vals:   Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(f) = &filter {
        if let Some(obj) = f.as_object() {
            for (k, v) in obj {
                let col = sanitize_column(k)?;
                where_parts.push(format!("{} = ?{}", col, bind_vals.len() + 1));
                match v {
                    serde_json::Value::String(s)  => bind_vals.push(Box::new(s.clone())),
                    serde_json::Value::Number(n)  => {
                        if let Some(i) = n.as_i64() { bind_vals.push(Box::new(i)); }
                        else                        { bind_vals.push(Box::new(n.as_f64().unwrap_or(0.0))); }
                    }
                    serde_json::Value::Bool(b) => bind_vals.push(Box::new(*b as i64)),
                    _ => {}
                }
            }
        }
    }
    if !where_parts.is_empty() {
        sql += &format!(" WHERE {}", where_parts.join(" AND "));
    }
    if let Some(ob) = &order_by {
        let parts: Vec<&str> = ob.split_whitespace().collect();
        let col = sanitize_column(parts[0])?;
        let dir = if parts.get(1).map(|s| s.to_uppercase()) == Some("DESC".to_string()) { "DESC" } else { "ASC" };
        sql += &format!(" ORDER BY {} {}", col, dir);
    }
    if let Some(lim) = limit { sql += &format!(" LIMIT {}", lim); }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let refs: Vec<&dyn rusqlite::ToSql> = bind_vals.iter().map(|b| b.as_ref()).collect();
    let rows: Result<Vec<serde_json::Value>, String> = stmt
        .query_map(refs.as_slice(), |row| { let d: String = row.get(0)?; Ok(d) })
        .map_err(|e| e.to_string())?
        .map(|r| r.map_err(|e| e.to_string()).and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string())))
        .collect();
    rows
}

/// Generic delete — IMMEDIATE transaction.
    #[command]
    pub async fn db_delete(
    table: String,
    id:    String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut guard = lock_state(&state.conn)?;
    let conn      = guard.as_mut().ok_or("DB not initialized")?;

    let sql       = format!("DELETE FROM {} WHERE id = ?1", sanitize_table(&table)?);

    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let n = tx.execute(&sql, params![id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(n > 0)
}

/// Count records in a table.
    #[command]
    pub async fn db_count(
    table:  String,
    filter: Option<serde_json::Value>,
    state:  State<'_, AppState>,
) -> Result<i64, String> {
    let _ = filter; // reserved for future WHERE support
    let guard = lock_state(&state.conn)?;
    let conn  = guard.as_ref().ok_or("DB not initialized")?;

    let sql   = format!("SELECT COUNT(*) FROM {}", sanitize_table(&table)?);
    Ok(conn.query_row(&sql, [], |r| r.get(0)).map_err(|e| e.to_string())?)
}

/// Phase 3: Create backup using VACUUM INTO — consistent, WAL-checkpointed snapshot.
    #[command]
    pub async fn create_backup(state: State<'_, AppState>) -> Result<String, String> {
    let db_path = {
        let g = lock_state(&state.db_path)?;
        g.as_ref().ok_or("DB not initialized")?.clone()
    };

    let backups_dir = db_path.parent()
        .ok_or("DB path has no parent directory")?
        .join("backups");
    fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    let ts = Utc::now().timestamp_millis();
    let backup_path = backups_dir.join(format!("contikpro_backup_{}.sqlite", ts));

    {
        let guard = lock_state(&state.conn)?;
        let conn  = guard.as_ref().ok_or("DB not initialized")?;
        conn.execute(&format!("VACUUM INTO '{}'", backup_path.to_string_lossy()), [])
            .map_err(|e| e.to_string())?;
    }

    log::info!("[ContikPro] Backup created: {}", backup_path.display());

    // ── Retention: keep at most MAX_BACKUPS, delete oldest first ─────────────
    const MAX_BACKUPS: usize = 30;
    match fs::read_dir(&backups_dir) {
        Ok(entries) => {
            let mut files: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().map(|x| x == "sqlite").unwrap_or(false))
                .collect();
            files.sort(); // lexicographic == chronological (timestamp in name)
            // Never delete the file we just created (it's the last after sort)
            if files.len() > MAX_BACKUPS {
                let to_delete = &files[..files.len() - MAX_BACKUPS];
                for old in to_delete {
                    if let Err(e) = fs::remove_file(old) {
                        log::warn!("[ContikPro] Backup retention: could not delete {}: {}", old.display(), e);
                    } else {
                        log::info!("[ContikPro] Backup retention: deleted {}", old.display());
                    }
                }
            }
        }
        Err(e) => log::warn!("[ContikPro] Backup retention: could not read backups dir: {}", e),
    }

    Ok(backup_path.to_string_lossy().into_owned())
}

/// Restore from a backup file.
    #[command]
    pub async fn restore_backup(
    backup_path: String,
    state:       State<'_, AppState>,
) -> Result<bool, String> {
    let source = PathBuf::from(&backup_path);
    if !source.exists() {
        return Err(format!("Backup not found: {}", backup_path));
    }
    let db_path = {
        let g = lock_state(&state.db_path)?;
        g.as_ref().ok_or("DB not initialized")?.clone()
    };
    { *lock_state(&state.conn)? = None; }
    fs::copy(&source, &db_path).map_err(|e| e.to_string())?;
    let conn = open_db(&db_path).map_err(|e| e.to_string())?;
    *lock_state(&state.conn)? = Some(conn);

    log::info!("[ContikPro] Restored from: {}", backup_path);
    Ok(true)
}

/// List backups, newest first.
    #[command]
    pub async fn list_backups(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let guard       = lock_state(&state.db_path)?;
    let db_path     = guard.as_ref().ok_or("DB not initialized")?;

    let backups_dir = db_path.parent()
        .ok_or("DB path has no parent directory")?
        .join("backups");
    if !backups_dir.exists() { return Ok(vec![]); }
    let mut files: Vec<String> = fs::read_dir(backups_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "sqlite").unwrap_or(false))
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    files.sort();
    files.reverse();
    Ok(files)
}


/// DB statistics (record counts + file size).
    #[command]
    pub async fn db_stats(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let guard = lock_state(&state.conn)?;
    let conn  = guard.as_ref().ok_or("DB not initialized")?;

    let mut s = serde_json::Map::new();
    for &t in &["contacts","invoices","quotes","expenses","items","templates","communications","payments"] {
        let c: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {}", t), [], |r| r.get(0)).unwrap_or(0);
        s.insert(t.to_string(), c.into());
    }
    drop(guard);
    if let Some(p) = lock_state(&state.db_path)?.as_ref() {
        if let Ok(m) = fs::metadata(p) { s.insert("db_size_bytes".into(), m.len().into()); }
    }

    Ok(serde_json::Value::Object(s))
}

/// Return the current schema version stored in schema_meta.
/// Used by Settings UI to display DB schema version.
    #[command]
    pub async fn get_schema_version_cmd(
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let guard = lock_state(&state.conn)?;
    let conn  = guard.as_ref().ok_or("DB not initialized")?;

    get_schema_version(conn).map_err(|e| e.to_string())
}

}

// ─── Security helpers ─────────────────────────────────────────────────────────

fn sanitize_table(name: &str) -> Result<&str, String> {
    const ALLOWED: &[&str] = &[
        "settings","contacts","items","templates","quotes","recurring_quotes",
        "invoices","recurring_invoices","expenses","payments","communications",
        "inbox_threads","inbox_messages","inbox_templates","email_templates","counters",
    ];
    ALLOWED.iter().find(|&&n| n == name).copied()
        .ok_or_else(|| format!("Unknown table: {}", name))
}

fn sanitize_column(name: &str) -> Result<&str, String> {
    const ALLOWED: &[&str] = &[
        "id","type","name","status","date","active","contact_id","supplier_id",
        "invoice_id","thread_id","party_id","party_type","channel","category",
        "next_run","is_default","updated_at","created_at","last_message_at",
        "quote_id","key","nif",
    ];
    ALLOWED.iter().find(|&&n| n == name).copied()
        .ok_or_else(|| format!("Unknown column: {}", name))
}

fn build_put_sql(
    table: &str,
    data:  &serde_json::Value,
) -> Result<(String, Vec<Box<dyn rusqlite::ToSql>>), String> {
    let t   = sanitize_table(table)?;
    let now = Utc::now().timestamp_millis();
    let json_str = serde_json::to_string(data).map_err(|e| e.to_string())?;
    let id  = data.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match t {
        "contacts" => {
            let type_ = data.get("type").and_then(|v| v.as_str()).unwrap_or("client").to_string();
            let name  = data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let nif   = data.get("nif").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let email = data.get("email").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let phone = data.get("phone").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (
                format!("INSERT OR REPLACE INTO {} (id,data,type,name,nif,email,phone,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", t),
                vec![Box::new(id),Box::new(json_str),Box::new(type_),Box::new(name),Box::new(nif),Box::new(email),Box::new(phone),Box::new(now)],
            )
        }
        "invoices"|"quotes" => {
            let cid    = data.get("contactId").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let status = data.get("status").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let date   = data.get("date").and_then(|v| v.as_i64()).unwrap_or(now);
            (
                format!("INSERT OR REPLACE INTO {} (id,data,contact_id,status,date,updated_at) VALUES (?1,?2,?3,?4,?5,?6)", t),
                vec![Box::new(id),Box::new(json_str),Box::new(cid),Box::new(status),Box::new(date),Box::new(now)],
            )
        }
        "expenses" => {
            let sid      = data.get("supplierId").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let category = data.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let date     = data.get("date").and_then(|v| v.as_i64()).unwrap_or(now);
            (
                format!("INSERT OR REPLACE INTO {} (id,data,supplier_id,category,date,updated_at) VALUES (?1,?2,?3,?4,?5,?6)", t),
                vec![Box::new(id),Box::new(json_str),Box::new(sid),Box::new(category),Box::new(date),Box::new(now)],
            )
        }
        _ => (
            format!("INSERT OR REPLACE INTO {} (id,data,updated_at) VALUES (?1,?2,?3)", t),
            vec![Box::new(id),Box::new(json_str),Box::new(now)],
        ),
    };
    Ok((sql, params))
}

// ─── App bootstrap ────────────────────────────────────────────────────────────

pub fn run() {
    let _ = env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .try_init();

    match tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::init_data_folder,
            commands::get_data_path,
            commands::check_db_integrity,
            commands::db_get,
            commands::db_put,
            commands::db_query,
            commands::db_delete,
            commands::db_count,
            commands::db_stats,
            commands::get_schema_version_cmd,
            commands::create_backup,
            commands::restore_backup,
            commands::list_backups,
        ])
        .setup(|app| {
            // Phase 6 — Auto-open saved path on every launch (returning users).
            // DataFolderSetup also calls init_data_folder, which is idempotent.
            //
            // NOTE: errors here are logged and skipped — never abort the app.
            // The frontend DataFolderSetup gate handles the "no saved path" case.
            let config_path = match app.path().app_config_dir() {
                Ok(dir) => dir.join("data_path.txt"),
                Err(e) => {
                    log::warn!("[ContikPro] setup: app_config_dir unavailable: {} — skipping auto-open", e);
                    return Ok(());
                }
            };

            if let Ok(saved) = fs::read_to_string(&config_path) {
                let saved = saved.trim().to_string();
                if !saved.is_empty() {
                    let db_path = PathBuf::from(&saved)
                        .join("ContikProData")
                        .join("contikpro.sqlite");

                    if db_path.exists() {
                        if let Some(data_dir) = db_path.parent() {
                            let _ = ensure_data_dirs(data_dir);
                        }
                        match open_db(&db_path) {
                            Ok(conn) => {
                                let state = app.state::<AppState>();
                                if let (Ok(mut c_guard), Ok(mut p_guard)) = (state.conn.lock(), state.db_path.lock()) {
                                    *c_guard = Some(conn);
                                    *p_guard = Some(db_path);
                                }
                                log::info!("[ContikPro] Auto-opened DB from: {}", saved);
                            }
                            Err(e) => log::error!("[ContikPro] Auto-open failed: {}", e),
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!()) {
        Ok(_) => (),
        Err(e) => {
            eprintln!("[ContikPro] Fatal: Tauri runtime failed to start: {}", e);
            std::process::exit(1);
        }
    }
}
