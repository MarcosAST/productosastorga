import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const KEEP_SIGNED_IN_KEY = 'astorga_keep_signed_in_v1';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

let isSigningIn = false;
// Access token stored strictly in memory (never in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export const loadKeepSignedInPreference = (): boolean => {
  try {
    const raw = localStorage.getItem(KEEP_SIGNED_IN_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
};

export const saveKeepSignedInPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(KEEP_SIGNED_IN_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota errors
  }
};

export const applyAuthPersistence = async (keepSignedIn: boolean): Promise<void> => {
  try {
    await setPersistence(
      auth,
      keepSignedIn ? browserLocalPersistence : browserSessionPersistence
    );
  } catch (err) {
    console.warn('No se pudo actualizar la persistencia de sesión:', err);
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
};

export const googleSignIn = async (options?: {
  loginHint?: string;
}): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => provider.addScope(scope));
    if (options?.loginHint) {
      provider.setCustomParameters({
        login_hint: options.loginHint,
      });
    } else {
      provider.setCustomParameters({
        prompt: 'select_account',
      });
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se recibió el token de acceso de Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Error al iniciar sesión con Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => cachedAccessToken;

export const clearCachedAccessToken = () => {
  cachedAccessToken = null;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
