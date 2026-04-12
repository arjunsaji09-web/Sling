import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { useState, useEffect, createContext, useContext, ErrorInfo, ReactNode } from 'react';
import { onAuthStateChanged, User, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import Login from './pages/Login';
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Profile = React.lazy(() => import('./pages/Profile'));
const AdminPanel = React.lazy(() => import('./pages/AdminPanel'));
import AdminGuard from './components/AdminGuard';
import { AnimatePresence, motion } from 'framer-motion';
import { Mail, LogOut, RefreshCw, CheckCircle, HelpCircle } from 'lucide-react';
import { cn } from './lib/utils';
import HelpModal from './components/HelpModal';

interface AuthContextType {
  user: User | null;
  username: string | null;
  photoURL: string | null;
  role: 'user' | 'admin' | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  username: null, 
  photoURL: null, 
  role: null,
  loading: true,
  refreshUser: async () => {} 
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
      let errorMessage = 'Something went wrong. Please refresh the page.';
      try {
        const errorInfo = JSON.parse(this.state.error.message);
        if (errorInfo.error.includes('insufficient permissions')) {
          errorMessage = 'You do not have permission to access this data. Please try logging in again.';
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] p-6 text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mb-6">
            <div className="w-10 h-10 text-red-500 text-2xl flex items-center justify-center">⚠️</div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Oops! Something went wrong</h2>
          <p className="text-gray-400 mb-8 max-w-md">{errorMessage}</p>
          <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
            <button 
              onClick={() => window.location.reload()}
              className="gradient-bg px-8 py-3 rounded-xl font-bold text-white shadow-xl shadow-purple-500/20"
            >
              Refresh Page
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
              Sign Out & Reset
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [showForceStart, setShowForceStart] = useState(false);
  const loadingRef = React.useRef(true);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

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
      console.log('Fetching profile for:', currentUser.uid);
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const name = data.username || null;
        const photo = data.photoURL || null;
        const userRole = data.role || (currentUser.email === 'admin@sling.app' ? 'admin' : 'user');
        
        console.log('Profile found:', name);
        setUsername(name);
        setPhotoURL(photo);
        setRole(userRole);
        
        if (name) safeSetItem('sling_username', name);
        safeSetItem('sling_role', userRole);
        if (photo) safeSetItem('sling_photo', photo);
        else safeRemoveItem('sling_photo');
      } else {
        console.log('No profile found in Firestore.');
        const userRole = currentUser.email === 'admin@sling.app' ? 'admin' : null;
        setUsername(null);
        setPhotoURL(null);
        setRole(userRole);
        safeRemoveItem('sling_username');
        safeRemoveItem('sling_photo');
        if (userRole) safeSetItem('sling_role', userRole);
        else safeRemoveItem('sling_role');
      }
    } catch (err) {
      console.error('Error fetching user document:', err);
    }
  };

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
    if (cachedUsername) setUsername(cachedUsername);
    if (cachedPhoto) setPhotoURL(cachedPhoto);
    if (cachedRole) setRole(cachedRole as any);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user ? 'Logged In' : 'Logged Out');
      setDebugInfo(user ? 'User detected, loading profile...' : 'No user session, redirecting to login...');
      
      try {
        if (user) {
          setUser(user);
          // Set loading false as soon as we know we have a user
          // Profile data can load in background
          loadingRef.current = false;
          setLoading(false);
          await fetchUserProfile(user);
        } else {
          setUser(null);
          setUsername(null);
          setPhotoURL(null);
          setRole(null);
          safeRemoveItem('sling_username');
          safeRemoveItem('sling_photo');
          safeRemoveItem('sling_role');
          safeRemoveItem('sling_messages');
          loadingRef.current = false;
          setLoading(false);
        }
      } catch (err) {
        console.error('Error in onAuthStateChanged:', err);
        loadingRef.current = false;
        setLoading(false);
      }
    }, (error) => {
      console.error('Auth Error:', error);
      setLoadError(`Firebase Auth Error: ${error.message}`);
      loadingRef.current = false;
      setLoading(false);
    });

    // Check if we can even reach Firebase
    const checkConnection = async () => {
      try {
        setDebugInfo('Checking Firebase connection...');
        // A simple check to see if we can reach the auth service
        if (!auth.app) {
          throw new Error('Firebase App not initialized');
        }
        setDebugInfo('Firebase initialized, waiting for auth state...');
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
        setLoadError(`Connection Timeout. \n\nDomain: ${window.location.hostname}\n\nTroubleshooting:\n1. Ensure "${window.location.hostname}" is added to "Authorized Domains" in Firebase Authentication.\n2. Check if your internet is stable.\n3. Try clearing your browser cache.`);
        setLoading(false);
      }
    }, 12000);

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
      const timer = setTimeout(() => setShowForceStart(true), 6000);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white font-sans">
        <div className="w-20 h-20 gradient-bg rounded-[24px] flex items-center justify-center shadow-[0_20px_50px_rgba(168,85,247,0.2)]">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
        <h2 className="mt-6 text-2xl font-bold tracking-tight">Sling</h2>
        <p className="mt-4 text-gray-500 text-sm animate-pulse">Initializing secure connection (v1.5)...</p>
        {debugInfo && <p className="mt-2 text-[10px] text-gray-700 font-mono">{debugInfo}</p>}
        
        {showForceStart && (
          <motion.button 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              loadingRef.current = false;
              setLoading(false);
            }}
            className="mt-8 text-gray-600 text-[10px] uppercase tracking-widest hover:text-gray-400 transition-colors font-bold"
          >
            Taking too long? Force Start
          </motion.button>
        )}
      </div>
    );
  }

  if (loadError && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] p-6 text-center">
        <div className="w-20 h-20 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6">
          <div className="w-10 h-10 text-amber-500 text-2xl flex items-center justify-center">⏳</div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Connection Timeout</h2>
        <p className="text-gray-400 mb-8 max-w-md whitespace-pre-wrap">{loadError}</p>
        <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
          <button 
            onClick={() => window.location.reload()}
            className="gradient-bg px-8 py-3 rounded-xl font-bold text-white shadow-xl shadow-purple-500/20"
          >
            Try Again
          </button>
          <button 
            onClick={() => {
              signOut(auth);
              setLoadError(null);
            }}
            className="text-gray-500 text-sm font-bold hover:text-gray-300 flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out & Reset
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] p-6 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md glass p-8 rounded-[2rem]"
        >
          <div className="w-20 h-20 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Mail className="w-10 h-10 text-purple-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Verify your email</h2>
          <p className="text-gray-400 mb-8">
            We've sent a verification link to <span className="text-white font-medium">{user.email}</span>. 
            Please check your inbox and click the link to activate your account.
            <br/><br/>
            <span className="text-purple-400 font-bold text-xs uppercase tracking-widest">⚠️ Check your spam folder!</span>
            <br/>
            <span className="text-[10px] text-gray-500">Sometimes verification emails are filtered as spam.</span>
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
                    setVerificationError("Email not verified yet. Please check your inbox and click the link.");
                  }
                } catch (err: any) {
                  console.error('Verification check error:', err);
                  setVerificationError("Failed to check status. Please try again or refresh the page.");
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
              {isVerifying ? "Checking..." : "I've verified my email"}
            </button>
            
            {verificationError && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "text-xs font-medium",
                  verificationError.includes("resent") ? "text-green-500" : "text-red-500"
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
                  setVerificationError("Verification email resent! Please check your inbox.");
                } catch (err: any) {
                  console.error('Resend error:', err.message);
                  setVerificationError("Too many requests. Please wait a moment before resending.");
                }
              }}
              className="w-full bg-white/5 py-4 rounded-xl font-bold text-gray-400 hover:text-white transition-colors"
            >
              Resend Email
            </button>
            
            <button 
              onClick={() => signOut(auth)}
              className="w-full flex items-center justify-center gap-2 text-gray-600 text-sm hover:text-gray-400 transition-colors pt-4"
            >
              <LogOut className="w-4 h-4" />
              Logout and try another account
            </button>

            <div className="pt-6 border-t border-white/5 mt-6">
              <button 
                onClick={() => setShowHelp(true)}
                className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors font-bold uppercase tracking-widest text-[10px] mx-auto"
              >
                <HelpCircle className="w-4 h-4" />
                How to use & Features
              </button>
            </div>
          </div>
        </motion.div>
        <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, username, photoURL, role, loading, refreshUser }}>
      <ErrorBoundary>
        <Router>
          <React.Suspense fallback={
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white font-sans">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center"
              >
                <div className="w-20 h-20 gradient-bg rounded-[24px] flex items-center justify-center shadow-[0_20px_50px_rgba(168,85,247,0.2)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/10 animate-pulse" />
                  <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin relative z-10" />
                </div>
                <h2 className="mt-6 text-3xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/50">Sling</h2>
                <div className="mt-4 flex items-center gap-2 text-gray-600 text-[10px] uppercase tracking-[0.3em] font-bold">
                  <div className="w-1 h-1 bg-purple-500 rounded-full animate-ping" />
                  <span>Securing Session</span>
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
          </React.Suspense>
        </Router>
      </ErrorBoundary>
    </AuthContext.Provider>
  );
}
