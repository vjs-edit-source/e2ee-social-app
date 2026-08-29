import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  RecaptchaVerifier, 
  signInWithPhoneNumber 
} from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyBqHOE6Ea1QT6Smz9srOxaFYO1FIXzJ8KU",
  authDomain: "e2ee-ab61b.firebaseapp.com",
  projectId: "e2ee-ab61b",
  storageBucket: "e2ee-ab61b.firebasestorage.app",
  messagingSenderId: "565869203923",
  appId: "1:565869203923:web:68d6a086a7eca4e9081f26"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export function setupRecaptcha(containerId = 'recaptcha-container') {
  if (typeof window === 'undefined') return null;
  
  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear();
    } catch (e) {}
  }

  window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {},
    'expired-callback': () => {}
  });

  return window.recaptchaVerifier;
}

export async function sendRealFirebaseOtp(phoneNumber) {
  const verifier = setupRecaptcha('recaptcha-container');
  return await signInWithPhoneNumber(auth, phoneNumber, verifier);
}
