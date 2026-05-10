import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { loginWithFirebase } from '../../api/auth';
import { firebaseAuth } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { getApiErrorMessage } from '../../utils';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail && !password) {
      setError('Please fill in your email and password.');
      return;
    }
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
      if (!credential.user.emailVerified) {
        await signOut(firebaseAuth);
        setError('Please verify your email address before logging in.');
        return;
      }
      const firebaseToken = await credential.user.getIdToken();
      const { accessToken, user } = await loginWithFirebase(firebaseToken);
      setAuth(accessToken, user);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Invalid email or password. Try again.');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full max-w-6xl mx-auto px-6">
      <div className="flex-1 flex flex-col justify-center py-12">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="bg-sky-gradient p-4 rounded-2xl shadow-lg">
            <svg width="40" height="40" viewBox="0 0 90 90" fill="none">
              <path d="M72 54a18 18 0 0 0-13.5-17.4A24 24 0 0 0 18 45a18 18 0 0 0 0 36h54a18 18 0 0 0 0-36z" fill="white" fillOpacity="0.92" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center">Welcome Back</h1>
        <p className="text-gray-500 text-sm text-center mt-1 mb-8">Sign in to check your commute risk</p>

        {/* Error Banner */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
            <span className="shrink-0">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                placeholder="yourname@gordoncollege.edu.ph"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <Link to="/auth/forgot" className="text-xs text-primary-600 font-medium">Forgot Password?</Link>
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Sign In
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <GoogleSignInButton disabled={isLoading} onError={(msg) => setError(msg)} />
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{' '}
          <Link to="/auth/signup" className="text-primary-600 font-semibold">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
