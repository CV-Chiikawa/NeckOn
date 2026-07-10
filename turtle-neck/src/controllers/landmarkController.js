const { db } = require('../config/db');
const calculateLandmarkFeatures = require('../utils/calculateLandmarkFeatures');

const LANDMARK_COLUMNS = [
  'user_id',
  'nose_source',
  'nose_x',
  'nose_y',
  'nose_z',
  'nose_visibility',
  'pose_nose_x',
  'pose_nose_y',
  'pose_nose_z',
  'pose_nose_visibility',
  'nose_tip_x',
  'nose_tip_y',
  'nose_tip_z',
  'nose_tip_visibility',
  'left_ear_x',
  'left_ear_y',
  'left_ear_z',
  'left_ear_visibility',
  'right_ear_x',
  'right_ear_y',
  'right_ear_z',
  'right_ear_visibility',
  'left_shoulder_x',
  'left_shoulder_y',
  'left_shoulder_z',
  'left_shoulder_visibility',
  'right_shoulder_x',
  'right_shoulder_y',
  'right_shoulder_z',
  'right_shoulder_visibility',
  'shoulder_center_x',
  'shoulder_center_y',
  'shoulder_center_z',
  'ear_center_x',
  'ear_center_y',
  'ear_center_z',
  'forward_distance',
  'nose_shoulder_distance',
  'head_angle',
  'shoulder_width',
  'min_visibility',
  'avg_visibility',
];

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

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });
}

function buildLandmarkRecord(userId, features) {
  return {
    user_id: userId,
    nose_source: features.nose_source,
    nose_x: features.nose_x,
    nose_y: features.nose_y,
    nose_z: features.nose_z,
    nose_visibility: features.nose_visibility,
    pose_nose_x: features.pose_nose_x,
    pose_nose_y: features.pose_nose_y,
    pose_nose_z: features.pose_nose_z,
    pose_nose_visibility: features.pose_nose_visibility,
    nose_tip_x: features.nose_tip_x,
    nose_tip_y: features.nose_tip_y,
    nose_tip_z: features.nose_tip_z,
    nose_tip_visibility: features.nose_tip_visibility,
    left_ear_x: features.left_ear_x,
    left_ear_y: features.left_ear_y,
    left_ear_z: features.left_ear_z,
    left_ear_visibility: features.left_ear_visibility,
    right_ear_x: features.right_ear_x,
    right_ear_y: features.right_ear_y,
    right_ear_z: features.right_ear_z,
    right_ear_visibility: features.right_ear_visibility,
    left_shoulder_x: features.left_shoulder_x,
    left_shoulder_y: features.left_shoulder_y,
    left_shoulder_z: features.left_shoulder_z,
    left_shoulder_visibility: features.left_shoulder_visibility,
    right_shoulder_x: features.right_shoulder_x,
    right_shoulder_y: features.right_shoulder_y,
    right_shoulder_z: features.right_shoulder_z,
    right_shoulder_visibility: features.right_shoulder_visibility,
    shoulder_center_x: features.shoulder_center_x,
    shoulder_center_y: features.shoulder_center_y,
    shoulder_center_z: features.shoulder_center_z,
    ear_center_x: features.ear_center_x,
    ear_center_y: features.ear_center_y,
    ear_center_z: features.ear_center_z,
    forward_distance: features.forward_distance,
    nose_shoulder_distance: features.nose_shoulder_distance,
    head_angle: features.head_angle,
    shoulder_width: features.shoulder_width,
    min_visibility: features.min_visibility,
    avg_visibility: features.avg_visibility,
  };
}

exports.createLandmark = async (req, res) => {
  const userId = req.user.id;

  let features;

  try {
    features = calculateLandmarkFeatures(req.body);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }

  const record = buildLandmarkRecord(userId, features);
  const values = LANDMARK_COLUMNS.map((column) => record[column]);
  const updateAssignments = LANDMARK_COLUMNS.filter((column) => column !== 'user_id').map(
    (column) => `${column} = excluded.${column}`
  );

  const sql = `
    INSERT INTO LandMark (${LANDMARK_COLUMNS.join(', ')}, created_at, updated_at)
    VALUES (${LANDMARK_COLUMNS.map(() => '?').join(', ')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      ${updateAssignments.join(', ')},
      updated_at = CURRENT_TIMESTAMP
  `;

  try {
    await run(sql, values);
    const savedRow = await get(
      `SELECT * FROM LandMark
       WHERE user_id = ?`,
      [userId]
    );

    return res.status(201).json({
      message: 'Baseline landmark data saved successfully.',
      landmarkId: savedRow.id,
      data: features,
    });
  } catch (err) {
    return res.status(500).json({
      message: 'Failed to save landmark data.',
      error: err.message,
    });
  }
};

exports.getLatestLandmark = (req, res) => {
  const userId = req.user.id;

  db.get(
    `SELECT * FROM LandMark
     WHERE user_id = ?`,
    [userId],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          message: 'Failed to fetch landmark data.',
          error: err.message,
        });
      }

      if (!row) {
        return res.status(404).json({
          message: 'No saved baseline landmark data found.',
        });
      }

      return res.status(200).json(row);
    }
  );
};
