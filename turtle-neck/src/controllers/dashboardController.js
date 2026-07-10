const { db } = require('../config/db');

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEARTBEAT_STATUS_SQL = `
  CASE current_status
    WHEN 'good' THEN 'normal'
    WHEN 'caution' THEN 'warning'
    WHEN 'bad' THEN 'danger'
  END
`;
const HEARTBEAT_DURATION_FOR_LAST_SEEN_DAY_SQL = `
  CAST(MAX(
    (
      julianday(last_seen_at) -
      MAX(
        julianday(started_at),
        julianday(DATETIME(DATE(last_seen_at, 'localtime'), 'utc'))
      )
    ) * 86400,
    0
  ) AS INTEGER)
`;

function toNumber(value) {
  return Number(value || 0);
}

function toMinutes(seconds) {
  return Number((seconds / 60).toFixed(2));
}

function calculateGoodPostureRate(normalSeconds, totalUsageSeconds) {
  if (totalUsageSeconds === 0) {
    return 0;
  }

  return Number(((normalSeconds / totalUsageSeconds) * 100).toFixed(2));
}

function formatDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildDailyChartItem(dateKey, sourceRow) {
  const totalUsageSeconds = toNumber(sourceRow?.total_usage_seconds);
  const normalSeconds = toNumber(sourceRow?.normal_seconds);
  const warningSeconds = toNumber(sourceRow?.warning_seconds);
  const dangerSeconds = toNumber(sourceRow?.danger_seconds);
  const dangerCount = toNumber(sourceRow?.danger_count);

  const date = new Date(`${dateKey}T00:00:00`);

  return {
    date: dateKey,
    day_label: DAY_LABELS[date.getDay()],
    total_usage_seconds: totalUsageSeconds,
    total_usage_minutes: toMinutes(totalUsageSeconds),
    normal_seconds: normalSeconds,
    warning_seconds: warningSeconds,
    danger_seconds: dangerSeconds,
    danger_count: dangerCount,
    good_posture_rate: calculateGoodPostureRate(normalSeconds, totalUsageSeconds),
  };
}

exports.getTodayDashboard = (req, res) => {
  const userId = req.user.id;

  const sql = `
    SELECT
      COALESCE(SUM(duration_seconds), 0) AS total_usage_seconds,
      COALESCE(SUM(CASE WHEN status = 'normal' THEN duration_seconds ELSE 0 END), 0) AS normal_seconds,
      COALESCE(SUM(CASE WHEN status = 'warning' THEN duration_seconds ELSE 0 END), 0) AS warning_seconds,
      COALESCE(SUM(CASE WHEN status = 'danger' THEN duration_seconds ELSE 0 END), 0) AS danger_seconds,
      COALESCE(SUM(CASE WHEN status = 'danger' THEN 1 ELSE 0 END), 0) AS danger_count
    FROM (
      SELECT status, duration_seconds, created_at
      FROM PostureLogs
      WHERE user_id = ?
        AND DATE(created_at, 'localtime') = DATE('now', 'localtime')

      UNION ALL

      SELECT
        ${HEARTBEAT_STATUS_SQL} AS status,
        ${HEARTBEAT_DURATION_FOR_LAST_SEEN_DAY_SQL} AS duration_seconds,
        last_seen_at AS created_at
      FROM PostureHeartbeatState
      WHERE user_id = ?
        AND DATE(last_seen_at, 'localtime') = DATE('now', 'localtime')
        AND last_seen_at > started_at
    ) AS posture_durations
  `;

  db.get(sql, [userId, userId], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: 'Failed to fetch today dashboard.',
        error: err.message,
      });
    }

    const totalUsageSeconds = toNumber(row.total_usage_seconds);
    const normalSeconds = toNumber(row.normal_seconds);
    const warningSeconds = toNumber(row.warning_seconds);
    const dangerSeconds = toNumber(row.danger_seconds);
    const dangerCount = toNumber(row.danger_count);

    return res.status(200).json({
      message: 'Today dashboard fetched successfully.',
      data: {
        total_usage_seconds: totalUsageSeconds,
        total_usage_minutes: toMinutes(totalUsageSeconds),
        normal_seconds: normalSeconds,
        warning_seconds: warningSeconds,
        danger_seconds: dangerSeconds,
        danger_count: dangerCount,
        good_posture_rate: calculateGoodPostureRate(normalSeconds, totalUsageSeconds),
      },
    });
  });
};

exports.getWeeklyDashboard = (req, res) => {
  const userId = req.user.id;

  const sql = `
    SELECT
      DATE(created_at, 'localtime') AS log_date,
      COALESCE(SUM(duration_seconds), 0) AS total_usage_seconds,
      COALESCE(SUM(CASE WHEN status = 'normal' THEN duration_seconds ELSE 0 END), 0) AS normal_seconds,
      COALESCE(SUM(CASE WHEN status = 'warning' THEN duration_seconds ELSE 0 END), 0) AS warning_seconds,
      COALESCE(SUM(CASE WHEN status = 'danger' THEN duration_seconds ELSE 0 END), 0) AS danger_seconds,
      COALESCE(SUM(CASE WHEN status = 'danger' THEN 1 ELSE 0 END), 0) AS danger_count
    FROM (
      SELECT status, duration_seconds, created_at
      FROM PostureLogs
      WHERE user_id = ?

      UNION ALL

      SELECT
        ${HEARTBEAT_STATUS_SQL} AS status,
        ${HEARTBEAT_DURATION_FOR_LAST_SEEN_DAY_SQL} AS duration_seconds,
        last_seen_at AS created_at
      FROM PostureHeartbeatState
      WHERE user_id = ?
        AND last_seen_at > started_at
    ) AS posture_durations
    WHERE DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-6 days')
    GROUP BY DATE(created_at, 'localtime')
    ORDER BY log_date ASC
  `;

  db.all(sql, [userId, userId], (err, rows) => {
    if (err) {
      return res.status(500).json({
        message: 'Failed to fetch weekly dashboard.',
        error: err.message,
      });
    }

    const resultMap = new Map();

    rows.forEach((row) => {
      resultMap.set(row.log_date, row);
    });

    const chart = [];
    const today = new Date();

    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateKey = formatDateKey(date);
      chart.push(buildDailyChartItem(dateKey, resultMap.get(dateKey)));
    }

    const summary = chart.reduce(
      (acc, item) => {
        acc.total_usage_seconds += item.total_usage_seconds;
        acc.normal_seconds += item.normal_seconds;
        acc.warning_seconds += item.warning_seconds;
        acc.danger_seconds += item.danger_seconds;
        acc.danger_count += item.danger_count;
        return acc;
      },
      {
        total_usage_seconds: 0,
        normal_seconds: 0,
        warning_seconds: 0,
        danger_seconds: 0,
        danger_count: 0,
      }
    );

    const peakUsageDay = chart.reduce((best, item) => {
      if (!best || item.total_usage_seconds > best.total_usage_seconds) {
        return item;
      }

      return best;
    }, null);

    return res.status(200).json({
      message: 'Weekly dashboard fetched successfully.',
      data: {
        summary: {
          ...summary,
          total_usage_minutes: toMinutes(summary.total_usage_seconds),
          good_posture_rate: calculateGoodPostureRate(
            summary.normal_seconds,
            summary.total_usage_seconds
          ),
        },
        chart,
        peak_usage_day: peakUsageDay
          ? {
              date: peakUsageDay.date,
              day_label: peakUsageDay.day_label,
              total_usage_seconds: peakUsageDay.total_usage_seconds,
              total_usage_minutes: peakUsageDay.total_usage_minutes,
            }
          : null,
      },
    });
  });
};
