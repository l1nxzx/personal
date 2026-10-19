import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { env } from './env.js';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

// Initialised lazily so importing this module never touches the filesystem (tests, tooling).
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const keyPath = path.resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);
  let serviceAccount: ServiceAccount & { project_id?: string };
  try {
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `Could not read Firebase service account key at ${keyPath}: ${(err as Error).message}`,
    );
  }

  return initializeApp({
    credential: cert(serviceAccount),
    storageBucket:
      env.FIREBASE_STORAGE_BUCKET ??
      `${serviceAccount.project_id ?? serviceAccount.projectId}.firebasestorage.app`,
  });
}

export function db(): Firestore {
  return getFirestore(app());
}

export function bucket(): Bucket {
  return getStorage(app()).bucket();
}
