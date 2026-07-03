import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from './ui';

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-void/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-ember-400 to-ember-700 shadow-[0_0_12px_2px_rgba(255,90,46,0.7)]" />
          Assay
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Link to="/app" className="hidden text-sm text-ink-300 hover:text-ink-100 sm:block">
                Dashboard
              </Link>
              <Button
                variant="ghost"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-ink-300 hover:text-ink-100">
                Log in
              </Link>
              <Button as={Link} to="/register">
                Get verified
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
