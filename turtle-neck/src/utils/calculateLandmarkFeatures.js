const REQUIRED_LANDMARK_KEYS = [
  'nose',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
];

const OPTIONAL_LANDMARK_KEYS = ['nose_tip', 'mouth_left', 'mouth_right'];
const SUPPORTED_LANDMARK_KEYS = [
  ...REQUIRED_LANDMARK_KEYS,
  ...OPTIONAL_LANDMARK_KEYS,
];

function isNumeric(value) {
  return value !== undefined && value !== null && !Number.isNaN(Number(value));
}

function toOptionalNumber(value) {
  return isNumeric(value) ? Number(value) : null;
}

function parseLandmark(landmark, key, required) {
  if (!landmark || typeof landmark !== 'object') {
    if (required) {
      throw new Error(`Missing landmark: ${key}`);
    }

    return null;
  }

  if (!isNumeric(landmark.x) || !isNumeric(landmark.y)) {
    if (required) {
      throw new Error(`Invalid x/y for landmark: ${key}`);
    }

    return null;
  }

  return {
    x: Number(landmark.x),
    y: Number(landmark.y),
    z: toOptionalNumber(landmark.z),
    visibility: toOptionalNumber(landmark.visibility),
  };
}

function parseNestedLandmarks(raw) {
  const landmarks = raw && typeof raw === 'object' ? raw.landmarks : null;

  if (!landmarks || typeof landmarks !== 'object') {
    return null;
  }

  const parsed = {};

  for (const key of SUPPORTED_LANDMARK_KEYS) {
    parsed[key] = parseLandmark(
      landmarks[key],
      key,
      REQUIRED_LANDMARK_KEYS.includes(key)
    );
  }

  return parsed;
}

function parseFlatLandmarks(raw) {
  const parsed = {};

  for (const key of SUPPORTED_LANDMARK_KEYS) {
    parsed[key] = parseLandmark(
      {
        x: raw[`${key}_x`],
        y: raw[`${key}_y`],
        z: raw[`${key}_z`],
        visibility: raw[`${key}_visibility`],
      },
      key,
      REQUIRED_LANDMARK_KEYS.includes(key)
    );
  }

  const hasFlatRequiredLandmarks = REQUIRED_LANDMARK_KEYS.every(
    (key) => parsed[key] !== null
  );

  if (!hasFlatRequiredLandmarks) {
    return null;
  }

  return parsed;
}

function normalizeReferenceSide(raw) {
  const side = raw?.reference_side || raw?.side || raw?.view_side || null;

  if (side !== 'left' && side !== 'right') {
    return null;
  }

  return side;
}

function normalizeLandmarks(raw) {
  const nested = parseNestedLandmarks(raw);
  const referenceSide = normalizeReferenceSide(raw || {});

  if (nested) {
    return {
      input_format: 'nested_landmarks',
      reference_side_hint: referenceSide,
      landmarks: nested,
    };
  }

  const flat = parseFlatLandmarks(raw || {});

  if (flat) {
    return {
      input_format: 'flat_fields',
      reference_side_hint: referenceSide,
      landmarks: flat,
    };
  }

  throw new Error(
    'Invalid landmark payload. Use `landmarks.{name}.{x,y,z,visibility}` or flat `*_x`, `*_y` fields.'
  );
}

function round(value) {
  return Number(value.toFixed(6));
}

function calculatePostureAngleDegrees(deltaX, deltaY) {
  return Math.atan2(Math.abs(deltaY), Math.abs(deltaX)) * (180 / Math.PI);
}

function calculateSideScore(landmarks, side) {
  const ear = landmarks[`${side}_ear`];
  const shoulder = landmarks[`${side}_shoulder`];

  if (!ear || !shoulder) {
    return Number.NEGATIVE_INFINITY;
  }

  const visibilityValues = [ear.visibility, shoulder.visibility].filter(
    (value) => value !== null
  );

  if (visibilityValues.length === 0) {
    return 0;
  }

  return visibilityValues.reduce((sum, value) => sum + value, 0) / visibilityValues.length;
}

function resolveReferenceSide(landmarks, referenceSideHint) {
  if (referenceSideHint) {
    return referenceSideHint;
  }

  const leftScore = calculateSideScore(landmarks, 'left');
  const rightScore = calculateSideScore(landmarks, 'right');

  if (rightScore > leftScore) {
    return 'right';
  }

  return 'left';
}

function calculateLandmarkFeatures(raw) {
  const normalized = normalizeLandmarks(raw);
  const { landmarks, input_format, reference_side_hint } = normalized;

  const poseNose = landmarks.nose;
  const effectiveNose = landmarks.nose_tip || poseNose;
  const noseSource = landmarks.nose_tip ? 'face_detection_nose_tip' : 'pose_nose';

  const referenceSide = resolveReferenceSide(landmarks, reference_side_hint);
  const referenceEar = landmarks[`${referenceSide}_ear`];
  const referenceShoulder = landmarks[`${referenceSide}_shoulder`];

  const leftEar = landmarks.left_ear;
  const rightEar = landmarks.right_ear;
  const leftShoulder = landmarks.left_shoulder;
  const rightShoulder = landmarks.right_shoulder;

  const shoulder_center_x = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulder_center_y = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulder_center_z =
    leftShoulder.z === null || rightShoulder.z === null
      ? null
      : (leftShoulder.z + rightShoulder.z) / 2;

  const ear_center_x = (leftEar.x + rightEar.x) / 2;
  const ear_center_y = (leftEar.y + rightEar.y) / 2;
  const ear_center_z =
    leftEar.z === null || rightEar.z === null ? null : (leftEar.z + rightEar.z) / 2;

  const forward_distance = referenceEar.x - referenceShoulder.x;
  const nose_shoulder_distance = effectiveNose.x - referenceShoulder.x;
  const head_angle = calculatePostureAngleDegrees(
    referenceEar.x - referenceShoulder.x,
    referenceEar.y - referenceShoulder.y
  );

  const shoulder_width = Math.sqrt(
    Math.pow(rightShoulder.x - leftShoulder.x, 2) +
      Math.pow(rightShoulder.y - leftShoulder.y, 2)
  );

  const visibilityValues = [
    effectiveNose.visibility,
    referenceEar.visibility,
    referenceShoulder.visibility,
  ].filter((value) => value !== null);

  const min_visibility =
    visibilityValues.length > 0 ? Math.min(...visibilityValues) : null;
  const avg_visibility =
    visibilityValues.length > 0
      ? visibilityValues.reduce((sum, value) => sum + value, 0) / visibilityValues.length
      : null;

  return {
    coordinate_space: 'normalized',
    input_format,
    reference_side: referenceSide,
    nose_source: noseSource,
    landmarks,
    nose_x: effectiveNose.x,
    nose_y: effectiveNose.y,
    nose_z: effectiveNose.z,
    nose_visibility: effectiveNose.visibility,
    pose_nose_x: poseNose.x,
    pose_nose_y: poseNose.y,
    pose_nose_z: poseNose.z,
    pose_nose_visibility: poseNose.visibility,
    nose_tip_x: landmarks.nose_tip ? landmarks.nose_tip.x : null,
    nose_tip_y: landmarks.nose_tip ? landmarks.nose_tip.y : null,
    nose_tip_z: landmarks.nose_tip ? landmarks.nose_tip.z : null,
    nose_tip_visibility: landmarks.nose_tip ? landmarks.nose_tip.visibility : null,
    left_ear_x: leftEar.x,
    left_ear_y: leftEar.y,
    left_ear_z: leftEar.z,
    left_ear_visibility: leftEar.visibility,
    right_ear_x: rightEar.x,
    right_ear_y: rightEar.y,
    right_ear_z: rightEar.z,
    right_ear_visibility: rightEar.visibility,
    left_shoulder_x: leftShoulder.x,
    left_shoulder_y: leftShoulder.y,
    left_shoulder_z: leftShoulder.z,
    left_shoulder_visibility: leftShoulder.visibility,
    right_shoulder_x: rightShoulder.x,
    right_shoulder_y: rightShoulder.y,
    right_shoulder_z: rightShoulder.z,
    right_shoulder_visibility: rightShoulder.visibility,
    mouth_left_x: landmarks.mouth_left ? landmarks.mouth_left.x : null,
    mouth_left_y: landmarks.mouth_left ? landmarks.mouth_left.y : null,
    mouth_left_z: landmarks.mouth_left ? landmarks.mouth_left.z : null,
    mouth_left_visibility: landmarks.mouth_left ? landmarks.mouth_left.visibility : null,
    mouth_right_x: landmarks.mouth_right ? landmarks.mouth_right.x : null,
    mouth_right_y: landmarks.mouth_right ? landmarks.mouth_right.y : null,
    mouth_right_z: landmarks.mouth_right ? landmarks.mouth_right.z : null,
    mouth_right_visibility: landmarks.mouth_right ? landmarks.mouth_right.visibility : null,
    reference_ear_x: referenceEar.x,
    reference_ear_y: referenceEar.y,
    reference_ear_z: referenceEar.z,
    reference_ear_visibility: referenceEar.visibility,
    reference_shoulder_x: referenceShoulder.x,
    reference_shoulder_y: referenceShoulder.y,
    reference_shoulder_z: referenceShoulder.z,
    reference_shoulder_visibility: referenceShoulder.visibility,
    shoulder_center_x: round(shoulder_center_x),
    shoulder_center_y: round(shoulder_center_y),
    shoulder_center_z: shoulder_center_z === null ? null : round(shoulder_center_z),
    ear_center_x: round(ear_center_x),
    ear_center_y: round(ear_center_y),
    ear_center_z: ear_center_z === null ? null : round(ear_center_z),
    forward_distance: round(forward_distance),
    nose_shoulder_distance: round(nose_shoulder_distance),
    head_angle: round(head_angle),
    shoulder_width: round(shoulder_width),
    min_visibility: min_visibility === null ? null : round(min_visibility),
    avg_visibility: avg_visibility === null ? null : round(avg_visibility),
  };
}

module.exports = calculateLandmarkFeatures;
