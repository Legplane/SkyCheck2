import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, KeyRound, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { firebaseAuth } from '../../lib/firebase';
import { validateEmail, getApiErrorMessage } from '../../utils';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) { setEmailError(err); return; }
    setEmailError('');
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim().toLowerCase(), {
        url: `${window.location.origin}/auth/login`,
      });
      setSent(true);
      setCountdown(60);
    } catch (err) {
      setEmailError(getApiErrorMessage(err, 'Failed to send reset email. Check the address and try again.'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim().toLowerCase(), {
        url: `${window.location.origin}/auth/login`,
      });
      setCountdown(60);
    } catch (err) {
      setEmailError(getApiErrorMessage(err, 'Failed to resend reset email.'));
    }
  }

  // ── State 2: Email Sent ──────────────────────────────────────────
  if (sent) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 w-full max-w-6xl mx-auto text-center gap-5">
        <div className="bg-green-100 p-8 rounded-full">
          <CheckCircle2 size={56} className="text-green-500" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-green-600">Email Sent!</h2>
          <p className="text-gray-600 text-sm mt-2 leading-relaxed">
            A password reset link was sent to:
            <br />
            <strong className="text-gray-900">{email}</strong>
          </p>
          <p className="text-gray-500 text-xs mt-2">The link expires in 1 hour.</p>
        </div>

        <button
          onClick={() => window.open('mailto:', '_blank')}
          className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
        >
          <Mail size={16} /> Open Email App
        </button>

        <p className="text-sm text-gray-500">
          {countdown > 0
            ? `Didn't receive it? Resend in 0:${String(countdown).padStart(2, '0')}`
            : (
              <button onClick={handleResend} className="text-primary-600 font-medium">
                Didn't receive it? Resend
              </button>
            )}
        </p>

        <Link to="/auth/login" className="text-sm text-primary-600 font-medium flex items-center gap-1">
          <ChevronLeft size={14} /> Back to Sign in
        </Link>
      </div>
    );
  }

  // ── State 1: Request Form ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full max-w-6xl mx-auto">
      <div className="flex items-center gap-3 px-4 pt-14 pb-4">
        <Link to="/auth/login" className="p-2 -ml-2 text-gray-600">
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-base font-semibold text-gray-900">Reset Password</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
        <div className="bg-amber-100 p-8 rounded-full">
          <KeyRound size={56} className="text-amber-500" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">Forgot Password?</h2>
          <p className="text-gray-600 text-sm mt-2 leading-relaxed">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>
          <div>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                placeholder="yourname@gordoncollege.edu.ph"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                required
                className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 ${emailError ? 'border-red-400' : 'border-gray-200'}`}
              />
            </div>
            {emailError && <p className="mt-1 text-xs text-red-500 text-left">{emailError}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Send Reset Link
          </button>
        </form>

        <Link to="/auth/login" className="text-sm text-primary-600 font-medium flex items-center gap-1">
          <ChevronLeft size={14} /> Back to Sign in
        </Link>
      </div>
    </div>
  );
}
