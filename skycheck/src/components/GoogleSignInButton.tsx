import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { loginWithFirebase } from '../api/auth';
import { firebaseAuth, googleProvider } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { getApiErrorMessage } from '../utils';

interface GoogleSignInButtonProps {
  disabled?: boolean;
  onError?: (message: string) => void;
}

export default function GoogleSignInButton({ disabled = false, onError }: GoogleSignInButtonProps) {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [busy, setBusy] = useState(false);

  async function handleGoogle() {
    setBusy(true);
    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      const firebaseToken = await credential.user.getIdToken();
      const { accessToken, user } = await loginWithFirebase(firebaseToken);
      setAuth(accessToken, user);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      onError?.(getApiErrorMessage(err, 'Google sign-in failed. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const block = disabled || busy;

  return (
    <div className={`relative w-full flex flex-col items-center ${block ? 'opacity-70' : ''}`}>
      {busy ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70">
          <div className="w-9 h-9 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : null}
      <button
        type="button"
        disabled={block}
        onClick={handleGoogle}
        className="w-full py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-3"
      >
        <span className="text-lg font-bold text-blue-500">G</span>
        Continue with Google
      </button>
    </div>
  );
}
