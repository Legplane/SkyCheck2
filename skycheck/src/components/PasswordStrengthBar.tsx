import { getPasswordStrength } from '../utils';

interface PasswordStrengthBarProps {
  password: string;
}

export default function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  if (!password) return null;
  const { score, label, color } = getPasswordStrength(password);

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= score ? color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {label && (
        <p className="text-xs text-gray-500">
          Password strength: <span className="font-medium">{label}</span>
        </p>
      )}
    </div>
  );
}
