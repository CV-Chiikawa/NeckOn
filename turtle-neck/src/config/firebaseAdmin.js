const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function normalizePrivateKey(privateKey) {
  if (typeof privateKey !== 'string') {
    return privateKey;
  }

  return privateKey.replace(/\\n/g, '\n');
}

function parseServiceAccountFromEnv() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!rawJson) {
    return null;
  }

  const parsed = JSON.parse(rawJson);

  if (parsed.private_key) {
    parsed.private_key = normalizePrivateKey(parsed.private_key);
  }

  return parsed;
}

function readServiceAccountFromFile() {
  const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');

  if (!fs.existsSync(serviceAccountPath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  if (parsed.private_key) {
    parsed.private_key = normalizePrivateKey(parsed.private_key);
  }

  return parsed;
}

function isFirebaseConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) || fs.existsSync(
    path.join(__dirname, '../../serviceAccountKey.json')
  );
}

function getServiceAccount() {
  const fromEnv = parseServiceAccountFromEnv();

  if (fromEnv) {
    return fromEnv;
  }

  const fromFile = readServiceAccountFromFile();

  if (fromFile) {
    return fromFile;
  }

  throw new Error(
    'Firebase service account is required. Set FIREBASE_SERVICE_ACCOUNT_JSON or provide serviceAccountKey.json.'
  );
}

function ensureInitialized() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount()),
    });
  }

  return admin;
}

module.exports = {
  messaging() {
    return ensureInitialized().messaging();
  },
  isFirebaseConfigured,
};
