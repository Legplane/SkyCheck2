import admin from 'firebase-admin';

function privateKey(): string | undefined {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw?.trim()) return undefined;
  return raw.replace(/\\n/g, '\n');
}

export function firebaseAdmin(): admin.app.App | null {
  if (admin.apps.length > 0) return admin.apps[0] ?? null;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const key = privateKey();

  if (!projectId || !clientEmail || !key) {
    console.warn('[Firebase] Admin SDK is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
    return null;
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: key,
    }),
  });
}

export async function verifyFirebaseIdToken(idToken: string) {
  const app = firebaseAdmin();
  if (!app) throw new Error('Firebase Admin SDK is not configured.');
  return app.auth().verifyIdToken(idToken);
}
