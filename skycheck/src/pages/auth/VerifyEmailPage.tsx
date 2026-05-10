import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, ChevronLeft, Loader2 } from 'lucide-react';
import { resendVerification, verifyEmail } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pendingVerifyEmail, setAuth } = useAuthStore();
  const token = searchParams.get('token');
  const [countdown, setCountdown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState('');
  const [verifyState, setVerifyState] = useState<'idle' | 'loading' | 'error'>(
    token ? 'loading' : 'idle',
  );

  useEffect(() => {
    if (token || pendingVerifyEmail) return;
    navigate('/auth/login', { replace: true });
  }, [pendingVerifyEmail, token, navigate]);

  useEffect(() => {
    if (!token) return;
    const verificationToken = token;
    let alive = true;

    async function completeVerification() {
      setVerifyState('loading');
      try {
        const { accessToken, user } = await verifyEmail(verificationToken);
        if (!alive) return;
        setAuth(accessToken, user);
        navigate('/app/dashboard', { replace: true });
      } catch (err) {
        if (!alive) return;
        setVerifyState('error');
        setMessage(getApiErrorMessage(err, 'Verification link is invalid or has expired.'));
      }
    }

    completeVerification();
    return () => {
      alive = false;
    };
  }, [token, setAuth, navigate]);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleResend() {
    if (!pendingVerifyEmail || countdown > 0) return;
    setIsResending(true);
    try {
      await resendVerification(pendingVerifyEmail);
      setCountdown(60);
      setMessage('Verification email resent!');
    } catch (err) {
      setMessage(getApiErrorMessage(err, 'Failed to resend. Try again.'));
    } finally {
      setIsResending(false);
    }
  }

  function openEmailApp() {
    window.open('mailto:', '_blank');
  }

  if (verifyState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 w-full max-w-6xl mx-auto text-center gap-4">
        <Loader2 size={42} className="text-primary-600 animate-spin" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verifying Email</h1>
          <p className="text-sm text-gray-500 mt-2">Please wait while SkyCheck activates your account.</p>
        </div>
      </div>
    );
  }

  if (verifyState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 w-full max-w-6xl mx-auto text-center gap-5">
        <div className="bg-red-100 p-8 rounded-full">
          <Mail size={56} className="text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verification Failed</h1>
          <p className="text-gray-600 text-sm mt-2 leading-relaxed">{message}</p>
        </div>
        <Link
          to="/auth/login"
          className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
        >
          Back to Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full max-w-6xl mx-auto">
      <div className="flex items-center gap-3 px-4 pt-14 pb-4">
        <button onClick={() => navigate('/auth/login')} className="p-2 -ml-2 text-gray-600">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-base font-semibold text-gray-900">Verify Email</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
        {/* Envelope illustration */}
        <div className="bg-blue-100 p-8 rounded-full">
          <Mail size={56} className="text-primary-600" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">Check Your Email</h2>
          <p className="text-gray-600 text-sm mt-2 leading-relaxed">
            We sent a verification link to:
            <br />
            <strong className="text-gray-900">{pendingVerifyEmail}</strong>
          </p>
          <p className="text-gray-500 text-xs mt-3">
            Click the link in your email to activate your account. Check your spam folder if you don't see it.
          </p>
        </div>

        {message && (
          <p className="text-sm text-primary-600 font-medium">{message}</p>
        )}

        <div className="w-full space-y-3">
          <button
            onClick={openEmailApp}
            className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
          >
            <Mail size={16} /> Open Email App
          </button>

          <button
            onClick={handleResend}
            disabled={countdown > 0 || isResending}
            className="w-full py-3 border-2 border-gray-200 rounded-xl text-gray-700 font-semibold text-sm disabled:opacity-60 hover:bg-gray-50 transition-colors"
          >
            {isResending
              ? 'Sending...'
              : countdown > 0
              ? `Resend available in 0:${String(countdown).padStart(2, '0')}`
              : 'Resend Verification Email'}
          </button>
        </div>

        <Link to="/auth/signup" className="text-xs text-primary-600 font-medium">
          Wrong email? Change it
        </Link>
      </div>
    </div>
  );
}
