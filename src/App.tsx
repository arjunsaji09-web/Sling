import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { useState, useEffect, createContext, useContext, ErrorInfo, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import Login from './pages/Login';
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Profile = React.lazy(() => import('./pages/Profile'));
import { AnimatePresence, motion } from 'framer-motion';

interface AuthContextType {
  user: User | null;
  username: string | null;
  photoURL: string | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  username: null, 
  photoURL: null, 
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
                localStorage.clear();
                window.location.href = '/';
              }}
              className="text-gray-500 text-sm font-bold hover:text-gray-300"
            >
              Clear Cache & Logout
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
  const [username, setUsername] = useState<string | null>(localStorage.getItem('sling_username'));
  const [photoURL, setPhotoURL] = useState<string | null>(localStorage.getItem('sling_photo'));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const loadingRef = React.useRef(true);

  const fetchUserProfile = async (currentUser: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const name = data.username;
        const photo = data.photoURL || null;
        
        setUsername(name);
        setPhotoURL(photo);
        
        localStorage.setItem('sling_username', name);
        if (photo) localStorage.setItem('sling_photo', photo);
        else localStorage.removeItem('sling_photo');
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

  useEffect(() => {
    // Try to get cached data
    const cachedUsername = localStorage.getItem('sling_username');
    const cachedPhoto = localStorage.getItem('sling_photo');
    if (cachedUsername) setUsername(cachedUsername);
    if (cachedPhoto) setPhotoURL(cachedPhoto);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user ? 'Logged In' : 'Logged Out');
      setUser(user);
      if (user) {
        fetchUserProfile(user);
      } else {
        setUsername(null);
        setPhotoURL(null);
        localStorage.removeItem('sling_username');
        localStorage.removeItem('sling_photo');
        localStorage.removeItem('sling_messages');
      }
      loadingRef.current = false;
      setLoading(false);
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

    const safetyTimeout = setTimeout(() => {
      if (loadingRef.current) {
        console.warn('Loading safety timeout reached');
        const currentUrl = window.location.href;
        setLoadError(`Connection Timeout. \n\nDomain: ${window.location.hostname}\nURL: ${currentUrl}\n\nThis usually means your domain is not added to "Authorized Domains" in Firebase Authentication > Settings.`);
        setLoading(false);
      }
    }, 12000);

    return () => {
      unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white font-sans">
        <div className="w-20 h-20 gradient-bg rounded-[24px] flex items-center justify-center shadow-[0_20px_50px_rgba(168,85,247,0.2)]">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
        <h2 className="mt-6 text-2xl font-bold tracking-tight">Sling</h2>
        <p className="mt-4 text-gray-500 text-sm animate-pulse">Initializing secure connection (v1.3)...</p>
        {debugInfo && <p className="mt-2 text-[10px] text-gray-700 font-mono">{debugInfo}</p>}
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
        <p className="text-gray-400 mb-8 max-w-md">{loadError}</p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={() => window.location.reload()}
            className="gradient-bg px-8 py-3 rounded-xl font-bold text-white shadow-xl shadow-purple-500/20"
          >
            Try Again
          </button>
          <button 
            onClick={() => setLoadError(null)}
            className="text-gray-500 text-sm font-bold hover:text-gray-300"
          >
            Continue to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, username, photoURL, loading, refreshUser }}>
      <ErrorBoundary>
        <Router>
          <React.Suspense fallback={
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white font-sans">
              <div className="w-20 h-20 gradient-bg rounded-[24px] flex items-center justify-center shadow-[0_20px_50px_rgba(168,85,247,0.2)]">
                <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
              <h2 className="mt-6 text-2xl font-bold tracking-tight">Sling</h2>
            </div>
          }>
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    {user && username ? <Navigate to="/dashboard" /> : <Navigate to="/login" />}
                  </motion.div>
                } />
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
                <Route path="/dashboard" element={
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    {user && username ? <Dashboard /> : <Navigate to="/login" />}
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
