import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Thermometer, Wind, Loader, CheckCircle2,
  Heart, AlertCircle, User
} from 'lucide-react';
import { submitHealthCheck, getTodayHealthCheck } from '../../api';
import type { HealthCheck, HealthCheckPayload } from '../../types';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getApiErrorMessage } from '../../utils';

type Feeling = 'well' | 'mild' | 'sick' | 'severe';

const FEELING_OPTIONS: { value: Feeling; label: string; emoji: string; color: string }[] = [
  { value: 'well',   label: 'Feeling Well',     emoji: '😊', color: 'border-green-400 bg-green-50  text-green-700' },
  { value: 'mild',   label: 'Mild Discomfort',  emoji: '😐', color: 'border-amber-400 bg-amber-50  text-amber-700' },
  { value: 'sick',   label: 'Feeling Sick',     emoji: '🤒', color: 'border-orange-400 bg-orange-50 text-orange-700' },
  { value: 'severe', label: 'Severely Ill',     emoji: '🤕', color: 'border-red-400  bg-red-50    text-red-700' },
];

const SYMPTOMS = [
  { key: 'hasFever',      label: 'Fever',               icon: '🌡️', desc: 'Body temperature feels elevated' },
  { key: 'hasCough',      label: 'Cough',               icon: '🫁', desc: 'Persistent or worsening cough' },
  { key: 'hasSoreThroat',label: 'Sore Throat',          icon: '🫣', desc: 'Throat pain or difficulty swallowing' },
  { key: 'hasFatigue',   label: 'Fatigue',              icon: '😴', desc: 'Unusual tiredness or weakness' },
  { key: 'hasDifficulty',label: 'Difficulty Breathing', icon: '😮‍💨', desc: 'Shortness of breath' },
  { key: 'hasHeadache',  label: 'Headache',             icon: '🤯', desc: 'Head pain or pressure' },
  { key: 'hasBodyPain',  label: 'Body Pain',            icon: '💢', desc: 'Muscle or joint pain' },
  { key: 'hasVomiting',  label: 'Vomiting / Nausea',   icon: '🤢', desc: 'Stomach upset' },
] as const;

type SymptomKey = typeof SYMPTOMS[number]['key'];

const EMPTY_FORM: HealthCheckPayload = {
  hasFever: false, feverTemp: null, hasCough: false, hasSoreThroat: false,
  hasFatigue: false, hasDifficulty: false, hasHeadache: false,
  hasBodyPain: false, hasVomiting: false, hasChronicCondition: false,
  chronicDetail: '', overallFeeling: 'well', additionalNotes: '',
};

const VALID_FEELINGS = new Set<Feeling>(['well', 'mild', 'sick', 'severe']);

function recordToForm(h: HealthCheck): HealthCheckPayload {
  const feeling = h.overallFeeling as Feeling;
  return {
    hasFever:            !!h.hasFever,
    feverTemp:           typeof h.feverTemp === 'number' && !Number.isNaN(h.feverTemp) ? h.feverTemp : null,
    hasCough:            !!h.hasCough,
    hasSoreThroat:       !!h.hasSoreThroat,
    hasFatigue:          !!h.hasFatigue,
    hasDifficulty:       !!h.hasDifficulty,
    hasHeadache:         !!h.hasHeadache,
    hasBodyPain:         !!h.hasBodyPain,
    hasVomiting:         !!h.hasVomiting,
    hasChronicCondition: !!h.hasChronicCondition,
    chronicDetail:       typeof h.chronicDetail === 'string' ? h.chronicDetail : '',
    overallFeeling:      VALID_FEELINGS.has(feeling) ? feeling : 'well',
    additionalNotes:     typeof h.additionalNotes === 'string' ? h.additionalNotes : '',
  };
}

export default function HealthCheckPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const qc        = useQueryClient();
  const isOnline  = useOnlineStatus();

  const [form, setForm]         = useState<HealthCheckPayload>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  /** Must be true to show the form when a check already exists today (Update my response). */
  const [editingToday, setEditingToday] = useState(false);
  const [error, setError]       = useState('');

  // Check if already submitted today
  const { data: existing, isLoading: checkLoading } = useQuery({
    queryKey: ['health-today'],
    queryFn:  getTodayHealthCheck,
    initialData: !isOnline ? qc.getQueryData<HealthCheck>(['health-today']) : undefined,
    staleTime: 5 * 60 * 1000,
    enabled: isOnline,
  });

  // Go/No-Go → "Update Health Check" passes state so we open the form even if the summary link is hard to tap.
  useEffect(() => {
    if (checkLoading || !existing || submitted) return;
    const wantEdit = Boolean((location.state as { editHealth?: boolean } | null)?.editHealth);
    if (!wantEdit) return;
    setForm(recordToForm(existing));
    setEditingToday(true);
    setError('');
    navigate('/app/health-check', { replace: true, state: {} });
  }, [checkLoading, existing, submitted, location.state, navigate]);

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => submitHealthCheck(form),
    onSuccess: async () => {
      setEditingToday(false);
      setSubmitted(true);
      try {
        await qc.invalidateQueries({ queryKey: ['health-today'] });
        await qc.fetchQuery({ queryKey: ['health-today'], queryFn: getTodayHealthCheck });
      } catch {
        /* cache refresh best-effort — save already succeeded */
      }
      await qc.invalidateQueries({ queryKey: ['go-no-go'] });
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function toggleSymptom(key: SymptomKey) {
    setForm(f => ({ ...f, [key]: !f[key] }));
  }

  function saveOfflineHealthCheck() {
    const now = new Date();
    const offlineRecord: HealthCheck = {
      ...form,
      id: `offline-${now.toISOString()}`,
      userId: 'offline',
      checkDate: now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
    };
    qc.setQueryData(['health-today'], offlineRecord);
    qc.removeQueries({ queryKey: ['go-no-go'] });
    setEditingToday(false);
    setSubmitted(true);
    setError('');
  }

  function handleSubmit() {
    if (!isOnline) {
      saveOfflineHealthCheck();
      return;
    }
    submit();
  }

  // ── Already submitted today (until user chooses to edit) ──────
  if (!checkLoading && existing && !submitted && !editingToday) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-28">
        <PageHeader onBack={() => navigate(-1)} />
        <div className="flex flex-col items-center justify-center flex-1 gap-5 px-8 text-center">
          <div className="bg-green-100 p-6 rounded-full">
            <CheckCircle2 size={48} className="text-green-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Today's Check Done!</h2>
            <p className="text-gray-500 text-sm mt-2">
              You already submitted your health check today.
              Feeling: <strong className="capitalize">{existing.overallFeeling}</strong>
            </p>
          </div>
          <button
            onClick={() => navigate('/app/go-no-go')}
            className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
          >
            See Today's Go / No-Go Result →
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(recordToForm(existing));
              setEditingToday(true);
              setError('');
            }}
            className="w-full py-3.5 text-sm text-primary-700 font-semibold border-2 border-primary-200 rounded-2xl hover:bg-primary-50 transition-colors"
          >
            Update my response
          </button>
        </div>
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-28">
        <PageHeader onBack={() => navigate(-1)} />
        <div className="flex flex-col items-center justify-center flex-1 gap-5 px-8 text-center">
          <div className="bg-green-100 p-6 rounded-full">
            <CheckCircle2 size={48} className="text-green-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Health Check Saved!</h2>
            <p className="text-gray-500 text-sm mt-2">
              Your health data has been recorded. View your Go/No-Go result now.
            </p>
          </div>
          <button
            onClick={() => navigate('/app/go-no-go')}
            className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
          >
            See Go / No-Go Result →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-28">
      <PageHeader onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto px-4 pt-2">
        {/* Header */}
        <div className="py-4">
          <h1 className="text-2xl font-bold text-gray-900">Daily Health Check</h1>
          <p className="text-sm text-gray-500 mt-1">
            How are you feeling today? This helps determine if it's safe for you to commute.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {!isOnline && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
            Offline mode: this health check will be used locally for today’s Go/No-Go estimate.
          </div>
        )}

        {/* Overall feeling */}
        <SectionTitle icon={<User size={16} />} title="How are you feeling overall?" />
        <div className="grid grid-cols-2 gap-3 mb-6">
          {FEELING_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setForm(f => ({ ...f, overallFeeling: opt.value }))}
              className={`p-3 rounded-2xl border-2 text-left transition-all ${
                form.overallFeeling === opt.value
                  ? opt.color + ' border-2 shadow-sm'
                  : 'border-gray-100 bg-white text-gray-700'
              }`}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <p className="text-sm font-semibold mt-1">{opt.label}</p>
            </button>
          ))}
        </div>

        {/* Symptoms */}
        <SectionTitle icon={<Thermometer size={16} />} title="Do you have any of these symptoms?" />
        <div className="space-y-2 mb-6">
          {SYMPTOMS.map(s => (
            <button
              key={s.key}
              onClick={() => toggleSymptom(s.key)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ${
                form[s.key]
                  ? 'border-red-400 bg-red-50'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <span className="text-xl shrink-0">{s.icon}</span>
              <div className="flex-1 text-left">
                <p className={`text-sm font-semibold ${form[s.key] ? 'text-red-700' : 'text-gray-800'}`}>
                  {s.label}
                </p>
                <p className="text-xs text-gray-500">{s.desc}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                form[s.key] ? 'bg-red-500 border-red-500' : 'border-gray-300'
              }`}>
                {form[s.key] && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>
            </button>
          ))}
        </div>

        {/* Fever temp if fever checked */}
        {form.hasFever && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4">
            <label className="text-sm font-semibold text-red-700 block mb-2">
              🌡️ What is your temperature? (optional)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="35"
                max="42"
                placeholder="e.g. 38.5"
                value={form.feverTemp ?? ''}
                onChange={e => setForm(f => ({ ...f, feverTemp: e.target.value ? parseFloat(e.target.value) : null }))}
                className="w-full px-4 py-3 border border-red-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">°C</span>
            </div>
          </div>
        )}

        {/* Chronic condition */}
        <SectionTitle icon={<Heart size={16} />} title="Do you have an underlying condition?" />
        <div className="mb-4">
          <button
            onClick={() => setForm(f => ({ ...f, hasChronicCondition: !f.hasChronicCondition }))}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ${
              form.hasChronicCondition ? 'border-amber-400 bg-amber-50' : 'border-gray-100 bg-white'
            }`}
          >
            <span className="text-xl">🩺</span>
            <div className="flex-1 text-left">
              <p className={`text-sm font-semibold ${form.hasChronicCondition ? 'text-amber-700' : 'text-gray-800'}`}>
                Yes — I have an underlying condition
              </p>
              <p className="text-xs text-gray-500">Asthma, diabetes, heart disease, hypertension, etc.</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              form.hasChronicCondition ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
            }`}>
              {form.hasChronicCondition && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>
          </button>

          {form.hasChronicCondition && (
            <input
              type="text"
              placeholder="Specify condition (optional)"
              value={form.chronicDetail}
              onChange={e => setForm(f => ({ ...f, chronicDetail: e.target.value }))}
              className="mt-2 w-full px-4 py-3 border border-amber-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          )}
        </div>

        {/* Additional notes */}
        <SectionTitle icon={<Wind size={16} />} title="Additional notes (optional)" />
        <textarea
          rows={3}
          placeholder="Anything else to note about how you feel today…"
          value={form.additionalNotes}
          onChange={e => setForm(f => ({ ...f, additionalNotes: e.target.value }))}
          className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none mb-6"
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full py-4 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-base"
        >
          {isPending
            ? <><Loader size={18} className="animate-spin" /> Saving…</>
            : existing?.id
              ? '✅ Update Health Check'
              : '✅ Submit Health Check'}
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary-600">{icon}</span>
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
    </div>
  );
}

function PageHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="flex items-center gap-3 px-4 pt-12 pb-3 bg-white border-b border-gray-100">
      <button onClick={onBack} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-xl">
        <ChevronLeft size={22} />
      </button>
      <h1 className="text-base font-bold text-gray-900">Health Check</h1>
    </header>
  );
}
