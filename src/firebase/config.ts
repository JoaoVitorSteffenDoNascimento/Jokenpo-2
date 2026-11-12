import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';

interface AppletFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

const FALLBACK_FIREBASE_CONFIG: AppletFirebaseConfig = {
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0039091541',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:461054413890:web:ea38c10279f1389e6fb1db',
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyCQTwYsG21oKqRA1DVl3jAXFR1SxFMcRJc',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'gen-lang-client-0039091541.firebaseapp.com',
  firestoreDatabaseId:
    import.meta.env.VITE_FIREBASE_DATABASE_ID ||
    'ai-studio-c4090351-98c9-4f79-8de3-e87e39eb7d27',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'gen-lang-client-0039091541.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '461054413890',
  measurementId: '',
  oAuthClientId:
    '461054413890-ibt6fjdn5sj96gqpuvhmkq1kaslt83g8.apps.googleusercontent.com',
  recaptchaSiteKey: '',
};

const configModules = import.meta.glob<{ default: AppletFirebaseConfig }>(
  '../../firebase-applet-config.json',
  { eager: true }
);

const loadedModule = Object.values(configModules)[0];
const firebaseConfig: AppletFirebaseConfig =
  loadedModule?.default || FALLBACK_FIREBASE_CONFIG;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account',
});

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Verifique a configuração do Firebase — cliente offline.');
    }
  }
}
testConnection();
