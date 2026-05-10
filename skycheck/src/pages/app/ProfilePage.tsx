import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Lock, Shield, Info, Trash2, ChevronRight,
  Bell, Volume2, Vibrate, LogOut, CheckCircle2
} from 'lucide-react';
import { logout, updatePreferences } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { getInitials } from '../../utils';

export default function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, clearAuth, updatePreferences: storeUpdatePrefs } = useAuthStore();

  const [showChangePass, setShowChangePass] = useState(false);

  const { mutate: doLogout } = useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearAuth();
      qc.clear();
      navigate('/auth/login', { replace: true });
    },
  });

  const { mutate: savePref } = useMutation({
    mutationFn: updatePreferences,
    onSuccess: (updatedUser) => {
      storeUpdatePrefs(updatedUser.preferences);
    },
  });

  function togglePref(key: keyof NonNullable<typeof user>['preferences']) {
    if (!user) return;
    const newVal = !user.preferences[key];
    storeUpdatePrefs({ [key]: newVal });   // optimistic
    savePref({ [key]: newVal });
  }

  function clearCache() {
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(n => caches.delete(n)));
    }
    qc.clear();
    alert('Cache cleared successfully.');
  }

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-20">
      {/* Header */}
      <header className="px-4 pt-12 pb-3 bg-white border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">Profile & Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* User Card */}
        <div className="bg-white mx-4 mt-4 rounded-2xl p-5 shadow-card flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-white text-xl font-bold">{getInitials(user.name)}</span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{user.name}</p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
            {user.isVerified && (
              <div className="flex items-center gap-1 mt-1">
                <CheckCircle2 size={13} className="text-green-500" />
                <span className="text-xs text-green-600 font-semibold">VERIFIED</span>
              </div>
            )}
          </div>
        </div>

        {/* Notifications */}
        <SectionHeader title="NOTIFICATIONS" />
        <div className="bg-white mx-4 rounded-2xl shadow-card divide-y divide-gray-50 overflow-hidden">
          <ToggleRow
            icon={<Bell size={18} className="text-primary-600" />}
            label="Morning Alerts"
            sublabel="Get alerted on high-risk days"
            checked={user.preferences.morningAlerts}
            onChange={() => togglePref('morningAlerts')}
          />
          <ToggleRow
            icon={<Volume2 size={18} className="text-purple-500" />}
            label="Alert Sound"
            sublabel="Play sound with notifications"
            checked={user.preferences.alertSound}
            onChange={() => togglePref('alertSound')}
          />
          <ToggleRow
            icon={<Vibrate size={18} className="text-amber-500" />}
            label="Vibration"
            sublabel="Vibrate on alerts"
            checked={user.preferences.vibration}
            onChange={() => togglePref('vibration')}
          />
        </div>

        {/* Account */}
        <SectionHeader title="ACCOUNT" />
        <div className="bg-white mx-4 rounded-2xl shadow-card divide-y divide-gray-50 overflow-hidden">
          <ActionRow
            icon={<Lock size={18} className="text-gray-500" />}
            label="Change Password"
            onClick={() => setShowChangePass(true)}
          />
          <ActionRow
            icon={<Shield size={18} className="text-gray-500" />}
            label="Privacy Policy"
            onClick={() => window.open('https://gordoncollege.edu.ph', '_blank')}
          />
          <ActionRow
            icon={<Info size={18} className="text-gray-500" />}
            label="About SkyCheck"
            onClick={() => {}}
            subtitle="v1.0.0 · Code-B · BSCS-2C"
          />
        </div>

        {/* Data & Storage */}
        <SectionHeader title="DATA & STORAGE" />
        <div className="bg-white mx-4 rounded-2xl shadow-card overflow-hidden">
          <ActionRow
            icon={<Trash2 size={18} className="text-gray-500" />}
            label="Clear Cached Weather Data"
            onClick={clearCache}
            subtitle="Frees up stored offline data"
          />
        </div>

        {/* Logout */}
        <div className="mx-4 mt-4 mb-6">
          <button
            onClick={() => doLogout()}
            className="w-full flex items-center justify-center gap-2 py-3.5 text-red-500 font-semibold text-sm hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePass && (
        <ChangePasswordModal onClose={() => setShowChangePass(false)} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="px-4 pt-5 pb-2 text-xs font-bold text-gray-400 tracking-widest">{title}</p>
  );
}

function ToggleRow({
  icon, label, sublabel, checked, onChange
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {sublabel && <p className="text-xs text-gray-500">{sublabel}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary-600' : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

function ActionRow({
  icon, label, onClick, subtitle
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  subtitle?: string;
}) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-gray-50 transition-colors">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </button>
  );
}

// ── Change Password Modal ─────────────────────────────────────────
import { changePassword } from '../../api/auth';
import { Eye, EyeOff } from 'lucide-react';

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: () => changePassword({ currentPassword: form.current, newPassword: form.next }),
    onSuccess: () => setSuccess(true),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to change password.';
      setError(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (form.next !== form.confirm) { setError('Passwords do not match.'); return; }
    mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-slideUp">
        {success ? (
          <div className="text-center space-y-3">
            <CheckCircle2 size={48} className="text-green-500 mx-auto" />
            <p className="font-bold text-gray-900">Password Changed!</p>
            <button onClick={onClose} className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold">Done</button>
          </div>
        ) : (
          <>
            <h3 className="font-bold text-gray-900 mb-4">Change Password</h3>
            {error && <p className="text-xs text-red-500 mb-3">⚠ {error}</p>}
            <form onSubmit={handleSubmit} className="space-y-3">
              {(['current', 'next'] as const).map((field) => (
                <div key={field} className="relative">
                  <input
                    type={show[field] ? 'text' : 'password'}
                    placeholder={field === 'current' ? 'Current password' : 'New password (8+ chars)'}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full px-3 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm"
                  />
                  <button type="button" onClick={() => setShow(s => ({ ...s, [field]: !s[field] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {show[field] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              ))}
              <input
                type="password"
                placeholder="Confirm new password"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">Cancel</button>
                <button type="submit" disabled={isPending} className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                  {isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
