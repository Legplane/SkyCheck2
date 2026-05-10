import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, ChevronLeft } from 'lucide-react';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { firebaseAuth } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { validateEmail, validatePassword, getApiErrorMessage } from '../../utils';
import PasswordStrengthBar from '../../components/PasswordStrengthBar';

export default function SignUpPage() {
  const navigate = useNavigate();
  const { setPendingVerifyEmail } = useAuthStore();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Full name is required';
    const emailErr = validateEmail(form.email);
    if (emailErr) errs.email = emailErr;
    const passErr = validatePassword(form.password);
    if (passErr) errs.password = passErr;
    if (form.password !== form.confirm) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        form.email.trim().toLowerCase(),
        form.password,
      );
      await updateProfile(credential.user, { displayName: form.name.trim() });
      await sendEmailVerification(credential.user, {
        url: `${window.location.origin}/auth/login`,
      });
      setPendingVerifyEmail(form.email);
      navigate('/auth/verify');
    } catch (err) {
      setApiError(getApiErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-14 pb-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-xl">
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-base font-semibold text-gray-900">Create Account</h1>
          <p className="text-xs text-gray-500">Get weather alerts before your commute</p>
        </div>
      </div>

      <div className="flex-1 px-6 py-4 overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Join SkyCheck 👋</h2>

        {/* API Error */}
        {apiError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
            ⚠ {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Full Name */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Full Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="e.g. Juan Dela Cruz"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 ${
                  errors.name ? 'border-red-400' : 'border-gray-200'
                }`}
              />
            </div>
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                placeholder="yourname@gordoncollege.edu.ph"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 ${
                  errors.email ? 'border-red-400' : 'border-gray-200'
                }`}
              />
            </div>
            {errors.email && <p className="mt-1 text-xs text-red-500">⚠ {errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className={`w-full pl-9 pr-10 py-3 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 ${
                  errors.password ? 'border-red-400' : 'border-gray-200'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <PasswordStrengthBar password={form.password} />
            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Confirm Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                className={`w-full pl-9 pr-10 py-3 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 ${
                  errors.confirm ? 'border-red-400' : 'border-gray-200'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirm && <p className="mt-1 text-xs text-red-500">{errors.confirm}</p>}
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Create Account
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <GoogleSignInButton disabled={isLoading} onError={(msg) => setApiError(msg)} />
        </form>

        <p className="text-center text-sm text-gray-500 mt-6 pb-8">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary-600 font-semibold">Log in</Link>
        </p>
      </div>
    </div>
  );
}
