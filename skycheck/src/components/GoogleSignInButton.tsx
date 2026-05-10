import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { loginWithGoogle } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { getApiErrorMessage } from '../utils';

const BTN_WIDTH = () =>
  typeof window !== 'undefined' ? Math.min(340, Math.max(260, Math.floor(window.innerWidth - 64))) : 320;

interface GoogleSignInButtonProps {
  disabled?: boolean;
  onError?: (message: string) => void;
}

export default function GoogleSignInButton({ disabled = false, onError }: GoogleSignInButtonProps) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [busy, setBusy] = useState(false);

  async function finishWithCredential(raw: string) {
    setBusy(true);
    try {
      const { accessToken, user } = await loginWithGoogle(raw.trim());
      setAuth(accessToken, user);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      onError?.(getApiErrorMessage(err, 'Google sign-in failed. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  if (!clientId) {
    return (
      <p className="text-xs text-gray-400 text-center leading-relaxed px-2">
        Add{' '}
        <code className="text-[10px] bg-gray-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> to{' '}
        <code className="text-[10px] bg-gray-100 px-1 rounded">.env</code>{' '}
        to enable Google.
      </p>
    );
  }

  const block = disabled || busy;

  return (
    <div className={`relative w-full flex flex-col items-center ${block ? 'pointer-events-none opacity-70' : ''}`}>
      {busy ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70">
          <div className="w-9 h-9 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : null}
      <div className="flex w-full justify-center overflow-hidden min-h-[44px]">
        <GoogleLogin
          useOneTap={false}
          ux_mode="popup"
          theme="outline"
          size="large"
          shape="pill"
          type="standard"
          text="continue_with"
          locale="en"
          containerProps={{
            style: {
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
            },
          }}
          width={BTN_WIDTH()}
          onSuccess={(credentialResponse) => {
            if (credentialResponse.credential) finishWithCredential(credentialResponse.credential);
            else onError?.('Missing Google credential.');
          }}
          onError={() => onError?.('Google popup closed or unavailable.')}
        />
      </div>
    </div>
  );
}
