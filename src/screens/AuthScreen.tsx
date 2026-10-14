import { useState, type FormEvent } from 'react';
import { Wrench, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error } = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password);

    setSubmitting(false);

    if (error) {
      if (error.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.');
      } else if (error.includes('already registered') || error.includes('already been registered')) {
        setError('Un compte existe déjà avec cet email. Connectez-vous.');
      } else if (error.includes('Password should be at least')) {
        setError('Le mot de passe doit contenir au moins 6 caractères.');
      } else {
        setError(error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-800 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-800/20">
            <Wrench className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Mon Garage</h1>
          <p className="text-sm text-slate-500 mt-1">Entretien et suivi de vos véhicules</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex gap-2 mb-5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Créer un compte
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-transparent transition-all"
                  placeholder="vous@exemple.fr"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-transparent transition-all"
                  placeholder="Minimum 6 caractères"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-blue-800 text-white rounded-xl font-medium hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {submitting ? 'Veuillez patienter…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-5">
            {mode === 'signin'
              ? 'Pas encore de compte ? Sélectionnez « Créer un compte » ci-dessus.'
              : 'Un seul compte suffit. Vous pourrez vous connecter depuis plusieurs appareils.'}
          </p>
        </div>
      </div>
    </div>
  );
}
