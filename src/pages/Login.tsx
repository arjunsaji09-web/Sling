import { useState, FormEvent, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Ghost, ArrowRight, ShieldCheck, Lock, User as UserIcon, MessageCircle, Camera, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';

interface LoginProps {
  isLoginMode?: boolean;
}

export default function Login({ isLoginMode = true }: LoginProps) {
  const [isLogin, setIsLogin] = useState(isLoginMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profilePic, setProfilePic] = useState<File | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(null);

  useEffect(() => {
    setIsLogin(isLoginMode);
    setError('');
  }, [isLoginMode]);

  const formatEmail = (user: string) => `${user.toLowerCase()}@ghostmsg.app`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('Profile picture must be under 2MB');
        return;
      }
      setProfilePic(file);
      setProfilePicPreview(URL.createObjectURL(file));
    }
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    setError('');

    const email = formatEmail(username);

    try {
      if (isLogin) {
        // Login
        await signInWithEmailAndPassword(auth, email, password);
        // The onAuthStateChanged in App.tsx will handle the redirect
      } else {
        // Sign Up
        // Check if username is taken in Firestore first
        const usernameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase()));
        if (usernameDoc.exists()) {
          setError('Username is already taken');
          setLoading(false);
          return;
        }

        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        
        // Create user profile with automatic DiceBear avatar
        const photoURL = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username.toLowerCase()}`;
        
        console.log('Updating Database');
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          username: username.toLowerCase(),
          photoURL,
          createdAt: new Date()
        });
        console.log('Database Updated');

        // Reserve username
        await setDoc(doc(db, 'usernames', username.toLowerCase()), {
          uid: user.uid
        });
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid username or password');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Username is already taken');
      } else {
        setError(err.message || 'Authentication failed');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a0a] relative">
      {/* Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[80px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[80px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-md z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <motion.div 
            whileHover={{ scale: 1.1, rotate: 10 }}
            className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center shadow-2xl shadow-purple-500/20 mb-4"
          >
            <MessageCircle className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold tracking-tighter mb-1">
            Sling
          </h1>
          <p className="text-gray-400 text-center text-sm">
            {isLogin ? 'Welcome back! Login to see your messages.' : 'Create an account to get anonymous messages.'}
          </p>
        </div>

        <div className="glass p-8 rounded-[2rem]">
          <form onSubmit={handleAuth} className="space-y-5">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white">
                {isLogin ? 'Login' : 'Sign Up'}
              </h2>
              <p className="text-gray-500 text-xs mt-1">
                {isLogin ? 'Enter your credentials to continue' : 'Join Sling to receive anonymous messages'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 ml-1 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="yourname"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-white placeholder:text-gray-700"
                  disabled={loading}
                />
              </div>
            </div>

            {!isLogin && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10 mb-2">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white">
                  {username ? username[0].toUpperCase() : '?'}
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">
                    A unique avatar will be generated automatically for your username!
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 ml-1 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-white placeholder:text-gray-700"
                  disabled={loading}
                />
              </div>
              {error && <p className="text-red-400 text-xs mt-3 ml-1 flex items-center gap-1">
                <span className="w-1 h-1 bg-red-400 rounded-full" />
                {error}
              </p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full gradient-bg py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 mt-4",
                loading && "animate-pulse"
              )}
            >
              {loading ? (isLogin ? 'Logging in...' : 'Creating account...') : (isLogin ? 'Login' : 'Create Account')}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="text-center mt-6">
              <p className="text-gray-500 text-xs">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                <Link 
                  to={isLogin ? "/signup" : "/login"} 
                  className="text-purple-400 font-bold hover:underline"
                >
                  {isLogin ? 'Sign Up' : 'Login'}
                </Link>
              </p>
            </div>
          </form>

          <div className="mt-8 flex items-center justify-center gap-2 text-gray-600 text-[10px] uppercase tracking-[0.2em] font-bold">
            <ShieldCheck className="w-3 h-3" />
            <span>Secure Authentication</span>
          </div>
        </div>

        <p className="mt-10 text-center text-gray-600 text-xs">
          Sling uses end-to-end encryption for your privacy.
        </p>
      </motion.div>
    </div>
  );
}
