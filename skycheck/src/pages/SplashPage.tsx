import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function SplashPage() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(isAuthenticated ? '/app/dashboard' : '/auth/login', { replace: true });
    }, 2200);
    return () => clearTimeout(timer);
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen bg-sky-gradient flex flex-col items-center justify-center select-none">
      {/* Cloud logo */}
      <div className="mb-6 animate-fadeIn">
        <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M72 54a18 18 0 0 0-13.5-17.4A24 24 0 0 0 18 45a18 18 0 0 0 0 36h54a18 18 0 0 0 0-36z"
            fill="white"
            fillOpacity="0.92"
          />
        </svg>
      </div>

      <h1 className="text-white text-4xl font-bold tracking-tight animate-fadeIn">
        SkyCheck
      </h1>
      <p className="text-blue-200 text-lg mt-2 font-light animate-fadeIn">
        Smart Weather &amp; Transit
      </p>
      <p className="text-blue-300 text-sm mt-1 animate-fadeIn">
        For Olongapo &amp; Route Commuters
      </p>

      {/* Spinner */}
      <div className="mt-12">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>

      <p className="text-blue-300/60 text-xs mt-16 absolute bottom-8">
        Code-B · BSCS-2C · Gordon College
      </p>
    </div>
  );
}
