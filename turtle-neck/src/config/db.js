// SQLite database setup and schema initialization

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '../../database.sqlite');
const DEFAULT_POSTURE_LOG_RETENTION_DAYS = 30;
const MAX_REASONABLE_POSTURE_LOG_SECONDS = 24 * 60 * 60;

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('SQLite connection failed:', err.message);
  } else {
    console.log('SQLite connected');
  }
});

db.configure('busyTimeout', 5000);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

async function ensureColumn(tableName, columnName, definition, backfillSql) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const hasColumn = columns.some((column) => column.name === columnName);

  if (hasColumn) {
    return false;
  }

  await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);

  if (backfillSql) {
    await run(backfillSql);
  }

  return true;
}

async function dedupeBaselineLandmarks() {
  await run(`
    DELETE FROM LandMark
    WHERE id NOT IN (
      SELECT id
      FROM LandMark AS current_row
      WHERE NOT EXISTS (
        SELECT 1
        FROM LandMark AS newer_row
        WHERE newer_row.user_id = current_row.user_id
          AND (
            COALESCE(newer_row.updated_at, newer_row.created_at) >
              COALESCE(current_row.updated_at, current_row.created_at)
            OR (
              COALESCE(newer_row.updated_at, newer_row.created_at) =
                COALESCE(current_row.updated_at, current_row.created_at)
              AND newer_row.id > current_row.id
            )
          )
      )
    )
  `);
}

function getPostureLogRetentionDays() {
  const rawRetentionDays = process.env.POSTURE_LOG_RETENTION_DAYS;

  if (rawRetentionDays === undefined || rawRetentionDays === '') {
    return DEFAULT_POSTURE_LOG_RETENTION_DAYS;
  }

  const retentionDays = Number(rawRetentionDays);

  if (!Number.isFinite(retentionDays)) {
    return DEFAULT_POSTURE_LOG_RETENTION_DAYS;
  }

  return Math.max(0, Math.floor(retentionDays));
}

async function pruneOldPostureLogs() {
  const retentionDays = getPostureLogRetentionDays();

  if (retentionDays === 0) {
    return;
  }

  await run(
    `DELETE FROM PostureLogs
     WHERE created_at IS NOT NULL
       AND DATETIME(created_at) < DATETIME('now', ?)`,
    [`-${retentionDays} days`]
  );
}

async function normalizeSuspiciousPostureLogDurations() {
  await run(
    `UPDATE PostureLogs
     SET duration_seconds = ROUND(duration_seconds / 1000.0),
         updated_at = CURRENT_TIMESTAMP
     WHERE duration_seconds > ?
       AND duration_seconds <= ?`,
    [MAX_REASONABLE_POSTURE_LOG_SECONDS, MAX_REASONABLE_POSTURE_LOG_SECONDS * 1000]
  );
}

async function initDatabase() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      nickname TEXT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      profile_image TEXT,
      snapshot_consent INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS LandMark (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nose_source TEXT,
      nose_x REAL,
      nose_y REAL,
      nose_z REAL,
      nose_visibility REAL,
      pose_nose_x REAL,
      pose_nose_y REAL,
      pose_nose_z REAL,
      pose_nose_visibility REAL,
      nose_tip_x REAL,
      nose_tip_y REAL,
      nose_tip_z REAL,
      nose_tip_visibility REAL,
      left_ear_x REAL,
      left_ear_y REAL,
      left_ear_z REAL,
      left_ear_visibility REAL,
      right_ear_x REAL,
      right_ear_y REAL,
      right_ear_z REAL,
      right_ear_visibility REAL,
      left_shoulder_x REAL,
      left_shoulder_y REAL,
      left_shoulder_z REAL,
      left_shoulder_visibility REAL,
      right_shoulder_x REAL,
      right_shoulder_y REAL,
      right_shoulder_z REAL,
      right_shoulder_visibility REAL,
      shoulder_center_x REAL,
      shoulder_center_y REAL,
      shoulder_center_z REAL,
      ear_center_x REAL,
      ear_center_y REAL,
      ear_center_z REAL,
      forward_distance REAL,
      nose_shoulder_distance REAL,
      head_angle REAL,
      shoulder_width REAL,
      min_visibility REAL,
      avg_visibility REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS Notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS UserDevices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_type TEXT NOT NULL CHECK (device_type IN ('web', 'android', 'ios')),
      fcm_token TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS PostureLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('normal', 'warning', 'danger')),
      duration_seconds INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS Snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS PostureHeartbeatState (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      current_status TEXT NOT NULL CHECK (current_status IN ('good', 'caution', 'bad')),
      started_at DATETIME NOT NULL,
      last_seen_at DATETIME NOT NULL,
      alert_sent INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn('Users', 'nickname', 'TEXT');
  await ensureColumn('Users', 'profile_image', 'TEXT');
  await ensureColumn('Users', 'snapshot_consent', 'INTEGER NOT NULL DEFAULT 0', `
    UPDATE Users
    SET snapshot_consent = COALESCE(snapshot_consent, 0)
  `);
  await ensureColumn(
    'Users',
    'updated_at',
    'DATETIME',
    `UPDATE Users
     SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)`
  );

  await ensureColumn('LandMark', 'nose_source', 'TEXT');
  await ensureColumn('LandMark', 'nose_z', 'REAL');
  await ensureColumn('LandMark', 'nose_visibility', 'REAL');
  await ensureColumn('LandMark', 'pose_nose_x', 'REAL');
  await ensureColumn('LandMark', 'pose_nose_y', 'REAL');
  await ensureColumn('LandMark', 'pose_nose_z', 'REAL');
  await ensureColumn('LandMark', 'pose_nose_visibility', 'REAL');
  await ensureColumn('LandMark', 'nose_tip_x', 'REAL');
  await ensureColumn('LandMark', 'nose_tip_y', 'REAL');
  await ensureColumn('LandMark', 'nose_tip_z', 'REAL');
  await ensureColumn('LandMark', 'nose_tip_visibility', 'REAL');
  await ensureColumn('LandMark', 'left_ear_z', 'REAL');
  await ensureColumn('LandMark', 'left_ear_visibility', 'REAL');
  await ensureColumn('LandMark', 'right_ear_z', 'REAL');
  await ensureColumn('LandMark', 'right_ear_visibility', 'REAL');
  await ensureColumn('LandMark', 'left_shoulder_z', 'REAL');
  await ensureColumn('LandMark', 'left_shoulder_visibility', 'REAL');
  await ensureColumn('LandMark', 'right_shoulder_z', 'REAL');
  await ensureColumn('LandMark', 'right_shoulder_visibility', 'REAL');
  await ensureColumn('LandMark', 'shoulder_center_x', 'REAL');
  await ensureColumn('LandMark', 'shoulder_center_y', 'REAL');
  await ensureColumn('LandMark', 'shoulder_center_z', 'REAL');
  await ensureColumn('LandMark', 'ear_center_x', 'REAL');
  await ensureColumn('LandMark', 'ear_center_y', 'REAL');
  await ensureColumn('LandMark', 'ear_center_z', 'REAL');
  await ensureColumn('LandMark', 'forward_distance', 'REAL');
  await ensureColumn('LandMark', 'nose_shoulder_distance', 'REAL');
  await ensureColumn('LandMark', 'head_angle', 'REAL');
  await ensureColumn('LandMark', 'shoulder_width', 'REAL');
  await ensureColumn('LandMark', 'min_visibility', 'REAL');
  await ensureColumn('LandMark', 'avg_visibility', 'REAL');
  await ensureColumn(
    'LandMark',
    'updated_at',
    'DATETIME',
    `UPDATE LandMark
     SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)`
  );

  await dedupeBaselineLandmarks();

  await ensureColumn(
    'UserDevices',
    'updated_at',
    'DATETIME',
    `UPDATE UserDevices
     SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)`
  );

  await ensureColumn('PostureLogs', 'status', 'TEXT');
  await ensureColumn('PostureLogs', 'duration_seconds', 'INTEGER');
  await ensureColumn('PostureLogs', 'created_at', 'DATETIME');
  await ensureColumn(
    'PostureLogs',
    'updated_at',
    'DATETIME',
    `UPDATE PostureLogs
     SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)`
  );
  await normalizeSuspiciousPostureLogDurations();
  await pruneOldPostureLogs();

  await ensureColumn('PostureHeartbeatState', 'alert_sent', 'INTEGER', `
    UPDATE PostureHeartbeatState
    SET alert_sent = COALESCE(alert_sent, 0)
  `);
  await ensureColumn('PostureHeartbeatState', 'created_at', 'DATETIME', `
    UPDATE PostureHeartbeatState
    SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
  `);
  await ensureColumn('PostureHeartbeatState', 'updated_at', 'DATETIME', `
    UPDATE PostureHeartbeatState
    SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_landmark_user_unique
    ON LandMark (user_id)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_landmark_user_created_at
    ON LandMark (user_id, created_at DESC)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_posture_logs_user_created_at
    ON PostureLogs (user_id, created_at DESC)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_user_created_at
    ON Snapshots (user_id, created_at DESC)
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_posture_heartbeat_user_unique
    ON PostureHeartbeatState (user_id)
  `);
}

module.exports = {
  db,
  initDatabase,
};
