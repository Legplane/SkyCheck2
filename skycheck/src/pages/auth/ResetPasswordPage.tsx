import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Eye, EyeOff, KeyRound, Lock, CheckCircle2 } from 'lucide-react';
import { resetPassword } from '../../api/auth';
import { getApiErrorMessage, validatePassword } from '../../utils';
import PasswordStrengthBar from '../../components/PasswordStrengthBar';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Reset link is missing. Please request a new password reset email.');
      return;
    }

    const passErr = validatePassword(password);
    if (passErr) {
      setError(passErr);
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword({ token, newPassword: password, confirmPassword: confirm });
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Reset failed. Please request a new link and try again.'));
    } finally {
      setIsLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 w-full max-w-6xl mx-auto text-center gap-5">
        <div className="bg-green-100 p-8 rounded-full">
          <CheckCircle2 size={56} className="text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Password Updated</h1>
          <p className="text-gray-600 text-sm mt-2">You can now sign in using your new password.</p>
        </div>
        <button
          onClick={() => navigate('/auth/login', { replace: true })}
          className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
        >
          Go to Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full max-w-6xl mx-auto">
      <div className="flex items-center gap-3 px-4 pt-14 pb-4">
        <Link to="/auth/login" className="p-2 -ml-2 text-gray-600">
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-base font-semibold text-gray-900">Create New Password</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
        <div className="bg-blue-100 p-8 rounded-full">
          <KeyRound size={56} className="text-primary-600" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reset Password</h2>
          <p className="text-gray-600 text-sm mt-2 leading-relaxed">
            Enter a new password for your SkyCheck account.
          </p>
        </div>

        {error && (
          <div className="w-full p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm text-left">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>
          <div className="text-left">
            <label className="text-sm font-medium text-gray-700 block mb-1.5">New Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <PasswordStrengthBar password={password} />
          </div>

          <div className="text-left">
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Confirm Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
}
