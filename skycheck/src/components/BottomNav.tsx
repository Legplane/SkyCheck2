import { NavLink } from 'react-router-dom';
import { Home, Route, Bell, User, ShieldCheck } from 'lucide-react';
import { clsx } from '../utils';

const TABS = [
  { to: '/app/dashboard', icon: Home,         label: 'Home'    },
  { to: '/app/routes',    icon: Route,        label: 'Routes'  },
  { to: '/app/go-no-go',  icon: ShieldCheck,  label: 'Go/No-Go'},
  { to: '/app/alerts',    icon: Bell,         label: 'Alerts'  },
  { to: '/app/profile',   icon: User,         label: 'Profile' },
] as const;

interface BottomNavProps {
  unreadAlerts?: number;
}

export default function BottomNav({ unreadAlerts = 0 }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-6xl bg-white border-t border-gray-100 safe-bottom z-50">
      <div className="flex items-center justify-around px-1 py-1">
        {TABS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-colors relative',
                isActive ? 'text-primary-600' : 'text-gray-400'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  <Icon
                    size={21}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    className={label === 'Go/No-Go' && isActive ? 'text-primary-600' : ''}
                  />
                  {label === 'Alerts' && unreadAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold min-w-[15px] h-3.5 rounded-full flex items-center justify-center px-0.5">
                      {unreadAlerts > 9 ? '9+' : unreadAlerts}
                    </span>
                  )}
                </div>
                <span className={clsx(
                  'text-[9px] font-medium',
                  isActive ? 'text-primary-600' : 'text-gray-400'
                )}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
