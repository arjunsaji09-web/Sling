import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { useState, useEffect, createContext, useContext, ErrorInfo, ReactNode } from 'react';
import { onAuthStateChanged, User, sendEmailVerification, signOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import Login from './pages/Login';
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Profile = React.lazy(() => import('./pages/Profile'));
const AdminPanel = React.lazy(() => import('./pages/AdminPanel'));

// Prefetch components
const prefetchDashboard = () => import('./pages/Dashboard');
const prefetchProfile = () => import('./pages/Profile');
import AdminGuard from './components/AdminGuard';
import { AnimatePresence, motion } from 'framer-motion';
import { Mail, LogOut, RefreshCw, CheckCircle, HelpCircle, Sun, Moon, Sparkles, X } from 'lucide-react';
import { cn } from './lib/utils';
import HelpModal from './components/HelpModal';
import { Language, translations } from './lib/translations';

import { MONETAG_DIRECT_LINK, openMonetagLink } from './lib/monetag';

interface ThemeContextType {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {}
});

export const useTheme = () => useContext(ThemeContext);

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en']) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key
});

export const useLanguage = () => useContext(LanguageContext);

interface AuthContextType {
  user: User | null;
  username: string | null;
  photoURL: string | null;
  isVerified: boolean;
  role: 'user' | 'admin' | null;
  customAppUrl: string | null;
  globalAppUrl: string | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  setPhotoURL: (url: string | null) => void;
  setUsername: (name: string | null) => void;
  setCustomAppUrl: (url: string | null) => void;
  setGlobalAppUrl: (url: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  username: null, 
  photoURL: null, 
  isVerified: false,
  role: null,
  customAppUrl: null,
  globalAppUrl: null,
  loading: true,
  refreshUser: async () => {},
  setPhotoURL: () => {},
  setUsername: () => {},
  setCustomAppUrl: () => {},
  setGlobalAppUrl: () => {}
});

export const useAuth = () => useContext(AuthContext);

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = 'something_went_wrong';
      try {
        const errorInfo = JSON.parse(this.state.error.message);
        if (errorInfo.error.includes('insufficient permissions')) {
          errorMessage = 'access_denied';
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-theme p-6 text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mb-6">
            <div className="w-10 h-10 text-red-500 text-2xl flex items-center justify-center">⚠️</div>
          </div>
          <h2 className="text-2xl font-bold text-theme mb-2">{translations[localStorage.getItem('sling_language') as Language || 'en'].oops}</h2>
          <p className="text-gray-400 mb-8 max-w-md">{translations[localStorage.getItem('sling_language') as Language || 'en'][errorMessage as any] || errorMessage}</p>
          <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
            <button 
              onClick={() => window.location.reload()}
              className="gradient-bg px-8 py-3 rounded-xl font-bold text-white shadow-xl shadow-purple-500/20"
            >
              {translations[localStorage.getItem('sling_language') as Language || 'en'].try_again}
            </button>
            <button 
              onClick={() => {
                signOut(auth);
                localStorage.clear();
                window.location.href = '/';
              }}
              className="text-gray-500 text-sm font-bold hover:text-gray-300 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              {translations[localStorage.getItem('sling_language') as Language || 'en'].sign_out_reset}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('sling_theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('sling_theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
    document.documentElement.style.setProperty('--color-scheme', theme);
  }, [theme]);

  useEffect(() => {
    // Handle legacy hash-based routes for backward compatibility
    if (window.location.hash) {
      const hashPath = window.location.hash.replace('#/', '').replace('#', '');
      if (hashPath && !['login', 'signup', 'dashboard', 'profile'].includes(hashPath)) {
        window.history.replaceState(null, '', `/${hashPath}`);
      }
    }
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [customAppUrl, setCustomAppUrl] = useState<string | null>(null);
  const [globalAppUrl, setGlobalAppUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [showForceStart, setShowForceStart] = useState(false);
  const loadingRef = React.useRef(true);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('sling_language') as Language) || 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('sling_language', lang);
  };

  const t = (key: keyof typeof translations['en']) => {
    return translations[language][key] || translations['en'][key] || key;
  };

  // Environment detection
  const isAPK = window.navigator.userAgent.toLowerCase().includes('wv') || (window as any).Android;

  const AdaptiveBanner = () => {
    const isAuthPage = window.location.pathname === '/login' || window.location.pathname === '/signup';
    const [isVisible, setIsVisible] = useState(() => {
      const closedAt = localStorage.getItem('sling_banner_closed');
      if (!closedAt) return true;
      // If closed more than 30 minutes ago, show again
      return Date.now() - parseInt(closedAt) > 30 * 60 * 1000;
    });

    if (!isVisible || isAuthPage) return null;

    const handleClose = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsVisible(false);
      localStorage.setItem('sling_banner_closed', Date.now().toString());
    };

    return (
      <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 pointer-events-none mb-4 md:mb-0">
        <div className="max-w-md mx-auto pointer-events-auto">
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="glass p-4 rounded-3xl shadow-[0_20px_50px_rgba(168,85,247,0.2)] flex items-center justify-between gap-4 overflow-hidden relative border border-white/10 group"
          >
            {/* Ad Background Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-amber-500/10 to-blue-500/10 animate-pulse" />
            
            <button 
              onClick={handleClose}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white transition-colors z-20"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 relative z-10 font-sans">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:rotate-12 transition-transform">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">{t('premium_content')}</span>
                <span className="text-xs font-bold text-theme">{t('unlock_extra')}</span>
              </div>
            </div>

            <button 
              onClick={() => openMonetagLink()}
              className="relative z-10 gradient-bg text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-tighter hover:scale-105 active:scale-95 transition-all shadow-lg shadow-purple-500/20"
            >
              {t('get_premium')}
            </button>
          </motion.div>
        </div>
      </div>
    );
  };

  // Safe localStorage access
  const safeGetItem = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  };

  const safeSetItem = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  };

  const safeRemoveItem = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  };

  const fetchUserProfile = async (currentUser: User) => {
    try {
      // Direct getDoc handles internal caching if persistence is enabled.
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const name = data.username || null;
        const photo = data.photoURL || null;
        const verified = data.isVerified || false;
        let userRole = data.role || 'user';
        
        // Force admin role for specific emails
        if (['admin@sling.app', 'arjunsaji09@gmail.com'].includes(currentUser.email || '')) {
          userRole = 'admin';
        }
        
        const appUrl = data.customAppUrl || null;
        
        setUsername(name);
        setPhotoURL(photo);
        setIsVerified(verified);
        setRole(userRole);
        setCustomAppUrl(appUrl);
        
        if (name) {
          safeSetItem('sling_username', name);
          // Ensure user is in usernames collection for search
          try {
            const usernameDoc = await getDoc(doc(db, 'usernames', name.toLowerCase()));
            if (!usernameDoc.exists()) {
              await setDoc(doc(db, 'usernames', name.toLowerCase()), {
                uid: currentUser.uid,
                email: currentUser.email,
                photoURL: photo
              });
              console.log('Registered missing username for search:', name);
            }
          } catch (e) {
            console.warn('Sync username failed:', e);
          }
        }
        safeSetItem('sling_role', userRole);
        if (photo) safeSetItem('sling_photo', photo);
        if (appUrl) safeSetItem('sling_app_url', appUrl);

        // Fetch global config in background
        getDoc(doc(db, 'settings', 'config')).then(configDoc => {
          if (configDoc.exists()) {
            const globalUrl = configDoc.data().publicUrl;
            setGlobalAppUrl(globalUrl);
            if (globalUrl) safeSetItem('sling_global_url', globalUrl);
          }
        }).catch(() => {});
      }
    } catch (err: any) {
      if (err.message?.includes('offline') || err.message?.includes('network')) {
        console.warn('Profile fetch failed (offline), relying on cache');
      } else {
        console.error('Error fetching user document:', err);
      }
    }
  };

  // Global background notification listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );

    let isFirstRun = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const data = change.doc.data();
          const unreadCount = data.unreadCount?.[user.uid] || 0;

          if (unreadCount > 0 && data.lastMessage && data.lastMessageAt) {
            const msgTime = data.lastMessageAt?.toMillis?.() || 0;
            if (Date.now() - msgTime < 60000) {
              if (Notification.permission === 'granted') {
                new Notification('New Message on Sling', {
                  body: data.lastMessage.substring(0, 100),
                  icon: photoURL || '/favicon.ico'
                });
                
                try {
                  const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
                  audio.play().catch(() => {});
                } catch (e) {}
              }
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user, photoURL]);

  const refreshUser = async () => {
    if (auth.currentUser) {
      await fetchUserProfile(auth.currentUser);
    }
  };

  function handleUnhandledRejection(event: PromiseRejectionEvent) {
    console.error('Unhandled Rejection:', event.reason);
  }

  useEffect(() => {
    // Try to get cached data
    const cachedUsername = safeGetItem('sling_username');
    const cachedPhoto = safeGetItem('sling_photo');
    const cachedRole = safeGetItem('sling_role');
    const cachedAppUrl = safeGetItem('sling_app_url');
    const cachedGlobalUrl = safeGetItem('sling_global_url');
    if (cachedUsername) setUsername(cachedUsername);
    if (cachedPhoto) setPhotoURL(cachedPhoto);
    if (cachedRole) setRole(cachedRole as any);
    if (cachedAppUrl) setCustomAppUrl(cachedAppUrl);
    if (cachedGlobalUrl) setGlobalAppUrl(cachedGlobalUrl);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Force admin role immediately if email matches
        if (['admin@sling.app', 'arjunsaji09@gmail.com'].includes(user.email || '')) {
          setRole('admin');
          safeSetItem('sling_role', 'admin');
        }
        
        setUser(user);
        prefetchDashboard();
        
        // If we have cached profile info, show UI immediately
        const cachedName = safeGetItem('sling_username');
        if (cachedName) {
          setLoading(false);
          loadingRef.current = false;
        }
        
        // Background fetch fresh data
        fetchUserProfile(user).finally(() => {
          setLoading(false);
          loadingRef.current = false;
        });
      } else {
        setUser(null);
        setUsername(null);
        setPhotoURL(null);
        setRole(null);
        setCustomAppUrl(null);
        setGlobalAppUrl(null);
        
        setLoading(false);
        loadingRef.current = false;
        ['sling_username', 'sling_photo', 'sling_role', 'sling_messages', 'sling_app_url', 'sling_global_url'].forEach(safeRemoveItem);
      }
    }, (error) => {
      console.error('Auth Error:', error);
      setLoadError(`Firebase Auth Error: ${error.message}`);
      setLoading(false);
      loadingRef.current = false;
    });

    // Check if we can even reach Firebase
    const checkConnection = async () => {
      try {
        // Silent check
        if (!auth.app) {
          throw new Error('Firebase App not initialized');
        }
      } catch (err: any) {
        setLoadError(`Firebase Init Error: ${err.message}`);
        loadingRef.current = false;
        setLoading(false);
      }
    };

    checkConnection();

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    const safetyTimeout = setTimeout(() => {
      if (loadingRef.current) {
        console.warn('Loading safety timeout reached');
        setLoadError(`Connection Timeout. \n\nDomain: ${window.location.hostname}\n\nTroubleshooting:\n1. Ensure "${window.location.hostname}" is added to "Authorized Domains" in Firebase Authentication.\n2. Check if your internet is stable.\n3. Try clearing your browser cache.\n4. If you are on GitHub Pages, ensure your vite.config.ts has base: './'`);
        setLoading(false);
      }
    }, 15000);

    return () => {
      unsubscribe();
      clearTimeout(safetyTimeout);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    // Auto-check verification status every 10 seconds if user is logged in but not verified
    let verificationInterval: NodeJS.Timeout | null = null;
    if (user && user.email && !user.emailVerified) {
      verificationInterval = setInterval(async () => {
        try {
          await user.reload();
          if (auth.currentUser?.emailVerified) {
            setUser(auth.currentUser);
            await fetchUserProfile(auth.currentUser);
          }
        } catch (e) {
          console.error('Auto-verification check failed:', e);
        }
      }, 10000);
    }

    return () => {
      if (verificationInterval) clearInterval(verificationInterval);
    };
  }, [user]);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setShowForceStart(true), 4000);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-theme text-theme font-sans">
        <div className="w-20 h-20 gradient-bg rounded-[24px] flex items-center justify-center shadow-[0_20px_50px_rgba(168,85,247,0.3)]">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
        <h2 className="mt-6 text-2xl logo-text text-theme">Sling</h2>
        <p className="mt-4 text-gray-500 text-xs font-bold tracking-widest uppercase opacity-50">v1.6</p>
        {/* Debug info removed for cleaner look */}
        
        {showForceStart && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 mt-8"
          >
            <button 
              onClick={() => {
                loadingRef.current = false;
                setLoading(false);
              }}
              className="bg-white/5 border border-white/10 px-6 py-3 rounded-xl text-purple-400 text-xs uppercase tracking-widest hover:bg-white/10 transition-all font-bold"
            >
              {t('force_start')}
            </button>
            <p className="text-[9px] text-gray-700 uppercase tracking-tighter">{t('stuck_msg')}</p>
          </motion.div>
        )}
      </div>
    );
  }

  if (loadError && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-theme p-6 text-center">
        <div className="w-20 h-20 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6">
          <div className="w-10 h-10 text-amber-500 text-2xl flex items-center justify-center">⏳</div>
        </div>
        <h2 className="text-2xl font-bold text-theme mb-2">{t('connection_timeout')}</h2>
        <p className="text-gray-400 mb-8 max-w-md whitespace-pre-wrap">{loadError}</p>
        <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
          <button 
            onClick={() => window.location.reload()}
            className="gradient-bg px-8 py-3 rounded-xl font-bold text-white shadow-xl shadow-purple-500/20"
          >
            {t('try_again')}
          </button>
          <button 
            onClick={() => {
              signOut(auth);
              setLoadError(null);
            }}
            className="text-gray-500 text-sm font-bold hover:text-gray-300 flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            {t('sign_out_reset')}
          </button>
        </div>
      </div>
    );
  }

  // Logged in but no profile (Half-logged-in state)
  // We let Login.tsx handle this state to allow users to finish their profile
  
  // Email Verification Screen
  if (user && user.email && !user.emailVerified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-theme p-6 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md glass p-8 rounded-[2rem]"
        >
          <div className="w-20 h-20 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Mail className="w-10 h-10 text-purple-500" />
          </div>
          <h2 className="text-2xl font-bold text-theme mb-2">{t('verify_email')}</h2>
          <p className="text-gray-400 mb-8">
            {t('verification_sent')} <span className="text-white font-medium">{user.email}</span>. 
            {t('check_inbox_activate')}
            <br/><br/>
            <span className="text-purple-400 font-bold text-xs uppercase tracking-widest">⚠️ {t('check_spam')}</span>
            <br/>
            <span className="text-[10px] text-gray-500">{t('spam_filtered')}</span>
          </p>
          
          <div className="space-y-4">
            <button 
              onClick={async () => {
                if (!user) return;
                setIsVerifying(true);
                try {
                  // Force reload the user profile from Firebase to get updated emailVerified status
                  await user.reload();
                  const updatedUser = auth.currentUser;
                  if (updatedUser?.emailVerified) {
                    // Success! Update local state
                    setUser(updatedUser);
                    await fetchUserProfile(updatedUser);
                  } else {
                    // Still not verified
                    setVerificationError(t('not_verified_error' as any) || "Email not verified yet.");
                  }
                } catch (err: any) {
                  console.error('Verification check error:', err);
                  setVerificationError(t('error'));
                } finally {
                  setIsVerifying(false);
                }
              }}
              disabled={isVerifying}
              className="w-full gradient-bg py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-xl shadow-purple-500/20 disabled:opacity-50"
            >
              {isVerifying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {isVerifying ? t('checking') : t('verified_button')}
            </button>
            
            {verificationError && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "text-xs font-medium",
                  verificationError.includes("resent") || verificationError.includes("enviado") || verificationError.includes("അയച്ചു") ? "text-green-500" : "text-red-500"
                )}
              >
                {verificationError}
              </motion.p>
            )}
            
            <button 
              onClick={async () => {
                setVerificationError(null);
                try {
                  await sendEmailVerification(user);
                  setVerificationError(t('resent_success'));
                } catch (err: any) {
                  console.error('Resend error:', err.message);
                  setVerificationError(t('too_many_requests'));
                }
              }}
              className="w-full bg-white/5 py-4 rounded-xl font-bold text-gray-400 hover:text-white transition-colors"
            >
              {t('resend_email')}
            </button>
            
            <button 
              onClick={() => signOut(auth)}
              className="w-full flex items-center justify-center gap-2 text-gray-600 text-sm hover:text-gray-400 transition-colors pt-4"
            >
              <LogOut className="w-4 h-4" />
              {t('logout_another')}
            </button>

            <div className="pt-6 border-t border-white/5 mt-6">
                <button 
                  onClick={() => setShowHelp(true)}
                  className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors font-bold uppercase tracking-widest text-[10px] mx-auto"
                >
                  <Sparkles className="w-4 h-4" />
                  {t('how_to_use_features')}
                </button>
            </div>
          </div>
        </motion.div>
        <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <LanguageContext.Provider value={{ language, setLanguage, t }}>
        <AuthContext.Provider value={{ 
          user, 
          username, 
          photoURL, 
          isVerified,
          role, 
          customAppUrl,
          globalAppUrl,
          loading, 
          refreshUser,
          setPhotoURL,
          setUsername,
          setCustomAppUrl,
          setGlobalAppUrl
        }}>
          <ErrorBoundary>
            <Router>
            <React.Suspense fallback={
              <div className="min-h-screen flex flex-col items-center justify-center font-sans" style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-20 h-20 gradient-bg rounded-[24px] flex items-center justify-center shadow-[0_20px_50px_rgba(168,85,247,0.3)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/10 animate-pulse" />
                    <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin relative z-10" />
                  </div>
                  <h2 className="mt-6 text-3xl logo-text text-theme">Sling</h2>
                  <div className="mt-4 text-gray-600 text-[10px] font-bold tracking-widest uppercase opacity-50">
                    v1.6
                  </div>
                </motion.div>
              </div>
            }>
              <AnimatePresence mode="wait">
                <Routes>
                  <Route path="/login" element={
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      {user && username ? <Navigate to="/dashboard" /> : <Login isLoginMode={true} />}
                    </motion.div>
                  } />
                  <Route path="/signup" element={
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      {user && username ? <Navigate to="/dashboard" /> : <Login isLoginMode={false} />}
                    </motion.div>
                  } />
                  <Route path="/" element={
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      {user && username ? <Navigate to="/dashboard" /> : <Navigate to="/login" />}
                    </motion.div>
                  } />
                  <Route path="/dashboard" element={
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      {user && username ? <Dashboard /> : <Navigate to="/login" />}
                    </motion.div>
                  } />
                  <Route path="/admin-secure-panel" element={
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <AdminGuard>
                        <AdminPanel />
                      </AdminGuard>
                    </motion.div>
                  } />
                  <Route path="/:username" element={
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <Profile />
                    </motion.div>
                  } />
                </Routes>
              </AnimatePresence>
              <AdaptiveBanner />
            </React.Suspense>
          </Router>
        </ErrorBoundary>
      </AuthContext.Provider>
    </LanguageContext.Provider>
  </ThemeContext.Provider>
  );
}
