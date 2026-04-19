import { useState, FormEvent, useEffect, useRef } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence,
  getRedirectResult
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp, limit, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { useAuth, useLanguage } from '../App';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ShieldCheck, Lock, User as UserIcon, MessageCircle, Mail, Eye, EyeOff, HelpCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';
import HelpModal from '../components/HelpModal';
import ThemeToggle from '../components/ThemeToggle';
import { Capacitor } from '@capacitor/core';

// Prefetch dashboard
const prefetchDashboard = () => import('./Dashboard');

interface LoginProps {
  isLoginMode?: boolean;
}

export default function Login({ isLoginMode = true }: LoginProps) {
  const { user: currentUser, username: profileUsername, refreshUser } = useAuth();
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(isLoginMode);
  const [isFinishingProfile, setIsFinishingProfile] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarType, setAvatarType] = useState<'boy' | 'girl' | 'neutral'>('neutral');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | React.ReactNode>('');
  const [success, setSuccess] = useState('');
  const [status, setStatus] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  const checkCapsLock = (e: React.KeyboardEvent) => {
    if (e.getModifierState('CapsLock')) {
      setIsCapsLockOn(true);
    } else {
      setIsCapsLockOn(false);
    }
  };

  useEffect(() => {
    const checkUsername = async () => {
      if (isLogin || isFinishingProfile || username.length < 3) {
        setIsUsernameAvailable(null);
        return;
      }
      
      const sanitized = username.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
      if (!sanitized) return;

      try {
        const docRef = doc(db, 'usernames', sanitized);
        const docSnap = await getDoc(docRef);
        setIsUsernameAvailable(!docSnap.exists());
      } catch (err) {
        console.error('Error checking username:', err);
      }
    };

    const timer = setTimeout(checkUsername, 150);
    return () => clearTimeout(timer);
  }, [username, isLogin, isFinishingProfile]);

  useEffect(() => {
    setIsLogin(isLoginMode);
    setError('');
  }, [isLoginMode]);

  useEffect(() => {
    // If user is logged in but has no profile username, switch to finishing profile mode
    if (currentUser && !profileUsername) {
      setIsFinishingProfile(true);
      setIsLogin(false);
      if (currentUser.email) setEmail(currentUser.email);
    } else if (currentUser && profileUsername) {
      // If we have both, we shouldn't be here, but just in case
      setIsFinishingProfile(false);
    }
  }, [currentUser, profileUsername]);

  const handleResetApp = () => {
    try {
      signOut(auth);
      localStorage.clear();
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  useEffect(() => {
    // Check if running in Capacitor APK
    const isCapacitor = (window as any).Capacitor !== undefined;
    const isLocal = window.location.hostname === 'localhost' || window.location.protocol === 'file:';
    
    if (isCapacitor) {
      console.log('Running in Native APK mode');
    }

    // Handle redirect result
    const handleRedirect = async () => {
      try {
        setLoading(true);
        const result = await getRedirectResult(auth);
        if (result) {
          await handleUserLogin(result.user);
        }
      } catch (err: any) {
        // Silent fail for redirect check
      } finally {
        setLoading(false);
      }
    };
    handleRedirect();
  }, []);

  const handleUserLogin = async (user: any) => {
    // We no longer auto-create profiles here.
    // Instead, we just let the useEffect trigger 'isFinishingProfile' mode
    // if the user document doesn't exist or doesn't have a username.
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data()?.username) {
        // Profile exists, App.tsx will redirect to dashboard
      } else {
        // Profile missing, isFinishingProfile will trigger
        setIsFinishingProfile(true);
      }
    } catch (err) {
      console.error('Error checking user profile:', err);
    }
  };

  const handleAuthError = (err: any) => {
    if (err.code === 'auth/unauthorized-domain') {
      setError(`This domain (${window.location.hostname}) is not authorized in Firebase. Please add it to "Authorized Domains" in the Firebase Console.`);
    } else if (err.code === 'auth/web-storage-unsupported') {
      setError('Your browser or APK does not support the required storage for login. Please try opening in a standard browser.');
    } else if (err.message?.includes('offline') || err.message?.includes('network')) {
      setError('You are currently offline. Please check your internet connection and try again.');
    } else {
      setError(err.message || 'Authentication failed');
    }
  };

  const formatEmail = (user: string) => `${user.toLowerCase()}@sling.app`;

  const isStrongPassword = (pass: string) => {
    return pass.length >= 6; // Simplified for smoother experience
  };

  const handleForgotPassword = async () => {
    let targetEmail = email;
    
    if (!targetEmail && username && !username.includes('@')) {
      setLoading(true);
      try {
        const sanitizedUsername = username.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
        const usernameDoc = await getDoc(doc(db, 'usernames', sanitizedUsername));
        if (usernameDoc.exists()) {
          targetEmail = usernameDoc.data().email;
        }
      } catch (e) {
        console.error('Username lookup failed:', e);
      }
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Please enter your registered email address or username to reset your password.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setSuccess(`A secure password reset link has been sent to ${targetEmail}. Please check your inbox (and spam folder) and follow the instructions to regain access.`);
      setError('');
    } catch (err: any) {
      setError(err.message || 'We encountered an issue sending the reset email. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const migrateGuestData = async (oldUid: string, newUid: string) => {
    try {
      const guestId = localStorage.getItem('sling_guest_id');
      console.log(`Migrating guest data from ${oldUid} to ${newUid}`);

      // Parallel fetch for speed
      const conversationsRef = collection(db, 'conversations');
      const messagesRef = collection(db, 'messages');
      
      const [convSnap, sentSnap, receivedSnap] = await Promise.all([
        getDocs(query(conversationsRef, where('participants', 'array-contains', oldUid))),
        getDocs(query(messagesRef, where('senderUid', '==', oldUid))),
        getDocs(query(messagesRef, where('recipientUid', '==', oldUid)))
      ]);

      const batch = writeBatch(db);
      let opCount = 0;
      
      // Conversations
      convSnap.forEach((doc) => {
        if (opCount < 480) {
          const data = doc.data();
          const p = (data.participants || []).map((uid: string) => uid === oldUid ? newUid : uid);
          const gs = { ...(data.guestStatus || {}) };
          if (gs[oldUid] !== undefined) {
            gs[newUid] = false;
            delete gs[oldUid];
          }
          batch.update(doc.ref, { participants: p, guestStatus: gs, updatedAt: serverTimestamp() });
          opCount++;
        }
      });

      // Sent messages
      sentSnap.forEach((doc) => {
        if (opCount < 480) {
          const p = (doc.data().participants || []).map((uid: string) => uid === oldUid ? newUid : uid);
          batch.update(doc.ref, { senderUid: newUid, participants: p });
          opCount++;
        }
      });

      // Received messages
      receivedSnap.forEach((doc) => {
        if (opCount < 480) {
          const p = (doc.data().participants || []).map((uid: string) => uid === oldUid ? newUid : uid);
          batch.update(doc.ref, { recipientUid: newUid, participants: p });
          opCount++;
        }
      });

      if (opCount > 0) await batch.commit();
      console.log('Migration done');
      localStorage.removeItem('sling_guest_id');
    } catch (err) {
      console.error('Migration error:', err);
    }
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    
    const sanitizedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    // Capture old UID if guest
    const oldUid = auth.currentUser?.uid;
    const isAnonymous = auth.currentUser?.isAnonymous;
    const isEmailInput = username.includes('@');
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!isLogin && !isFinishingProfile) {
      if (!cleanEmail || !cleanEmail.includes('@')) {
        setError('Please enter a valid email address');
        return;
      }
      if (sanitizedUsername.length < 3) {
        setError('Username must be at least 3 characters');
        return;
      }
      if (cleanPassword.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      if (cleanPassword !== confirmPassword.trim()) {
        setError('Passwords do not match');
        return;
      }
    }

    if (isFinishingProfile) {
      if (sanitizedUsername.length < 3) {
        setError('Username must be at least 3 characters');
        return;
      }
      if (!cleanPassword) {
        setError('Please set a password for your account');
        return;
      }
    }

    if (isLogin) {
      if (!username.trim()) {
        setError('Please enter your username or email');
        return;
      }
      if (!cleanPassword) {
        setError('Please enter your password');
        return;
      }
    }
    
    setLoading(true);
    setError('');

    try {
      if (isFinishingProfile && currentUser) {
        if (!password) {
          setError('Please set a password for your account');
          setLoading(false);
          return;
        }

        let avatarStyle = 'avataaars';
        if (avatarType === 'boy') avatarStyle = 'micah';
        if (avatarType === 'girl') avatarStyle = 'lorelei';
        const photoURL = `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${sanitizedUsername}`;
        const userRole = (['admin@sling.app', 'arjunsaji09@gmail.com'].includes(currentUser.email || '')) ? 'admin' : 'user';

        await Promise.all([
          setDoc(doc(db, 'users', currentUser.uid), {
            uid: currentUser.uid,
            username: sanitizedUsername,
            email: currentUser.email || cleanEmail,
            photoURL,
            avatarType,
            role: userRole,
            password: cleanPassword, // Store password as requested
            createdAt: serverTimestamp()
          }, { merge: true }),
          setDoc(doc(db, 'usernames', sanitizedUsername), {
            uid: currentUser.uid,
            email: currentUser.email || cleanEmail,
            photoURL
          })
        ]);
        
        // Refresh profile in App.tsx
        if (refreshUser) await refreshUser();
        return;
      }

      if (isLogin) {
        // Hardcoded admin access for 'arjun'
        if ((sanitizedUsername === 'arjun' || username.trim().toLowerCase() === 'arjun') && cleanPassword === 'Arjuner@123_&-') {
          const { user } = await signInWithEmailAndPassword(auth, 'admin@sling.app', 'Arjuner@123_&-');
          if (isAnonymous && oldUid && user.uid !== oldUid) {
            await migrateGuestData(oldUid, user.uid);
          }
          return;
        }

        let loginEmail = '';
        if (isEmailInput) {
          loginEmail = username.trim().toLowerCase();
        } else {
          const usernameDoc = await getDoc(doc(db, 'usernames', sanitizedUsername));
          if (!usernameDoc.exists()) {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('username', '==', sanitizedUsername), limit(1));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              loginEmail = querySnapshot.docs[0].data().email;
            } else {
              loginEmail = `${sanitizedUsername}@sling.app`;
            }
          } else {
            loginEmail = usernameDoc.data().email || `${sanitizedUsername}@sling.app`;
          }
        }

        const { user: loggedInUser } = await signInWithEmailAndPassword(auth, loginEmail, cleanPassword);
        if (isAnonymous && oldUid && loggedInUser.uid !== oldUid) {
          await migrateGuestData(oldUid, loggedInUser.uid);
        }
      } else {
        // Sign Up
        const usernameDoc = await getDoc(doc(db, 'usernames', sanitizedUsername));
        if (usernameDoc.exists()) {
          setError('Username is already taken');
          setLoading(false);
          return;
        }

        const { user } = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        
        // Migrate data if they were a guest
        if (isAnonymous && oldUid && user.uid !== oldUid) {
          await migrateGuestData(oldUid, user.uid);
        }
        
        // Send verification in background
        sendEmailVerification(user).catch(() => {});
        
        let avatarStyle = 'avataaars';
        if (avatarType === 'boy') avatarStyle = 'micah';
        if (avatarType === 'girl') avatarStyle = 'lorelei';
        
        const photoURL = `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${sanitizedUsername}`;
        const userRole = 'user';
        
        await Promise.all([
          setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            username: sanitizedUsername,
            email: cleanEmail,
            photoURL,
            avatarType,
            role: userRole,
            createdAt: serverTimestamp()
          }),
          setDoc(doc(db, 'usernames', sanitizedUsername), {
            uid: user.uid,
            email: cleanEmail,
            photoURL
          })
        ]);
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      setLoading(false);
      
      const isInvalid = err.code === 'auth/user-not-found' || 
                        err.code === 'auth/wrong-password' || 
                        err.code === 'auth/invalid-credential' ||
                        err.code === 'auth/invalid-email';

      const isOfflineError = err.message?.includes('offline') || err.message?.includes('network');
      
      if (isOfflineError) {
        setError('Connection failed. Please check your internet and try again.');
      } else if (isInvalid) {
        setError(
          <div className="flex flex-col gap-2">
            <span>Incorrect password or account name.</span>
            <button 
              onClick={() => handleForgotPassword()}
              className="text-purple-400 font-bold hover:underline text-left"
            >
              Forgot your password? Click here to reset it.
            </button>
          </div>
        );
      } else if (err.code === 'auth/email-already-in-use') {
        // Automatically switch to login mode and show error there
        setIsLogin(true);
        if (email) setUsername(email);
        setError(
          <div className="flex flex-col gap-2">
            <span className="font-bold text-white">This email is already registered.</span>
            <p className="text-[11px] text-gray-400">We've switched you to the Login tab. Please enter your password to continue.</p>
            <button 
              onClick={() => handleForgotPassword()}
              className="text-pink-400 font-bold hover:underline text-left text-xs mt-1"
            >
              Forgot Password? Reset it here →
            </button>
          </div>
        );
      } else if (err.code === 'auth/missing-password') {
        setError('Please enter your password to continue.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please wait a few minutes or reset your password.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-theme relative">
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
            className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center shadow-[0_20px_50px_rgba(168,85,247,0.3)] mb-4"
          >
            <MessageCircle className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-4xl logo-text mb-1 text-theme">
            Sling
          </h1>
          <p className="text-gray-400 text-center text-sm">
            {isLogin ? 'Welcome back! Login to see your messages.' : 'Create an account to get anonymous messages.'}
          </p>
        </div>

        <div className="glass p-8 rounded-[2rem]">
          <form onSubmit={handleAuth} className="space-y-5">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-theme">
                {isFinishingProfile ? t('app_name') : (isLogin ? t('login') : t('signup'))}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                {isFinishingProfile 
                  ? 'Choose a username to complete your setup' 
                  : (isLogin ? 'Enter your credentials to continue' : 'Join Sling to receive anonymous messages')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 ml-1 uppercase tracking-wider">
                {isFinishingProfile ? 'Choose Username' : (isLogin ? t('username') : t('username'))}
              </label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                <input
                  type="text"
                  name="username"
                  autoComplete="username email"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  placeholder={isLogin ? "yourname or email@example.com" : "yourname"}
                  maxLength={isLogin ? 50 : 20}
                  className="w-full input-theme rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-500"
                  disabled={loading}
                />
                {username.length >= 3 && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {isUsernameAvailable === true && <div className="text-green-500 text-[10px] font-bold">Available</div>}
                    {isUsernameAvailable === false && <div className="text-red-500 text-[10px] font-bold">Taken</div>}
                    {isUsernameAvailable === null && <div className="w-3 h-3 border-2 border-white/10 border-t-purple-500 rounded-full animate-spin" />}
                  </div>
                )}
              </div>
            </div>

            {!isLogin && !isFinishingProfile && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 ml-1 uppercase tracking-wider">
                  {t('email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="email@example.com"
                    className="w-full input-theme rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-500"
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {(isLogin || !isFinishingProfile || isFinishingProfile) && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 ml-1 uppercase tracking-wider">
                  {isFinishingProfile ? 'Set Password' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="••••••••"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    onKeyUp={checkCapsLock}
                    className="w-full input-theme rounded-xl py-3.5 pl-11 pr-12 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-500"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isCapsLockOn && (
                  <div className="mt-2 flex items-center gap-2 text-yellow-500 text-[10px] font-bold animate-pulse">
                    <ShieldCheck className="w-3 h-3" />
                    CAPS LOCK IS ON
                  </div>
                )}
                {isLogin && (
                  <div className="flex justify-end mt-2">
                    <button 
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[10px] text-purple-400 font-bold hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}
                {(isFinishingProfile || !isLogin) && password && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-1 h-1">
                      {[1, 2, 3, 4].map((i) => {
                        const strength = 
                          (password.length >= 8 ? 1 : 0) +
                          (/[A-Z]/.test(password) ? 1 : 0) +
                          (/[0-9]/.test(password) ? 1 : 0) +
                          (/[!@#$%^&*(),.?":{}|<>]/.test(password) ? 1 : 0);
                        return (
                          <div 
                            key={i}
                            className={cn(
                              "flex-1 rounded-full transition-all duration-500",
                              i <= strength 
                                ? strength <= 2 ? "bg-red-500" : strength === 3 ? "bg-yellow-500" : "bg-green-500"
                                : "bg-white/5"
                            )}
                          />
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <p className={cn("text-[10px] flex items-center gap-1", password.length >= 8 ? "text-green-400" : "text-gray-600")}>
                        <span className="w-1 h-1 rounded-full bg-current" /> 8+ Characters
                      </p>
                      <p className={cn("text-[10px] flex items-center gap-1", /[A-Z]/.test(password) ? "text-green-400" : "text-gray-600")}>
                        <span className="w-1 h-1 rounded-full bg-current" /> Uppercase
                      </p>
                      <p className={cn("text-[10px] flex items-center gap-1", /[0-9]/.test(password) ? "text-green-400" : "text-gray-600")}>
                        <span className="w-1 h-1 rounded-full bg-current" /> Number
                      </p>
                      <p className={cn("text-[10px] flex items-center gap-1", /[!@#$%^&*(),.?":{}|<>]/.test(password) ? "text-green-400" : "text-gray-600")}>
                        <span className="w-1 h-1 rounded-full bg-current" /> Special Char
                      </p>
                    </div>
                  </div>
                )}

                {!isLogin && (
                  <div className="mt-5">
                    <label className="block text-xs font-medium text-gray-500 mb-2 ml-1 uppercase tracking-wider">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError('');
                    }}
                        placeholder="••••••••"
                        onKeyUp={checkCapsLock}
                        className="w-full input-theme rounded-xl py-3.5 pl-11 pr-12 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-500"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {isCapsLockOn && (
                      <div className="mt-2 flex items-center gap-2 text-yellow-500 text-[10px] font-bold animate-pulse">
                        <ShieldCheck className="w-3 h-3" />
                        CAPS LOCK IS ON
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isLogin && (
              <div className="space-y-4 mb-4">
                <div className="flex flex-col items-center gap-3 p-4 bg-theme rounded-2xl border border-white/10">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden border-2 border-white/10">
                    <img 
                      src={`https://api.dicebear.com/7.x/${avatarType === 'boy' ? 'micah' : avatarType === 'girl' ? 'lorelei' : 'avataaars'}/svg?seed=${username || 'preview'}`} 
                      alt="Avatar Preview" 
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex gap-2 w-full">
                    {[
                      { id: 'boy', label: 'Boy', icon: '👦' },
                      { id: 'girl', label: 'Girl', icon: '👧' },
                      { id: 'neutral', label: 'Neutral', icon: '👤' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAvatarType(opt.id as any)}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[10px] font-bold transition-all border",
                          avatarType === opt.id 
                            ? "bg-purple-500/20 border-purple-500 text-white" 
                            : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl mb-6"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-1">Check your email</p>
                    <p className="text-gray-400 text-[11px] leading-relaxed">
                      We've sent a professional reset link to <span className="text-white font-medium">{success.split('sent to ')[1]?.split('!')[0]}</span>. 
                      It should arrive in 1-2 minutes. <span className="text-purple-400 font-bold">Check your spam folder if you don't see it!</span>
                    </p>
                    <button 
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-purple-400 font-bold hover:underline text-[10px] mt-2 flex items-center gap-1"
                    >
                      Didn't get it? Resend link <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-6 relative overflow-hidden"
              >
                <div className="flex items-start gap-3 relative z-10">
                  <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-red-400 text-xs font-bold uppercase tracking-wider mb-1">{t('issue_encountered')}</p>
                    <div className="text-gray-400 text-[11px] leading-relaxed">
                      {error}
                    </div>
                    {typeof error === 'string' && error.toLowerCase().includes('offline') && (
                      <button 
                        type="button"
                        onClick={() => handleAuth({ preventDefault: () => {} } as any)}
                        className="mt-3 text-red-400 font-bold hover:underline text-[10px] flex items-center gap-1 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {t('retry_connection')}
                      </button>
                    )}
                    {typeof error === 'string' && error.includes('already registered') && (
                      <button 
                        type="button"
                        onClick={() => {
                          setIsLogin(true);
                          setError('');
                          setPassword('');
                          setConfirmPassword('');
                          if (email) setUsername(email);
                        }}
                        className="mt-3 text-purple-400 font-bold hover:underline text-[10px] flex items-center gap-1 bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20 hover:bg-purple-500/20 transition-all"
                      >
                        {t('switch_to_login')}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              onMouseEnter={prefetchDashboard}
              className={cn(
                "w-full gradient-bg h-16 rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 shadow-xl shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 mt-4 group overflow-hidden relative",
                loading && "animate-pulse"
              )}
            >
              {loading 
                ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{isFinishingProfile ? 'Saving...' : (isLogin ? 'Logging in...' : 'Creating...')}</span>
                  </div>
                ) 
                : (
                  <>
                    <span className="relative z-10">{isFinishingProfile ? 'Finish Setup' : (isLogin ? 'Login' : 'Create Account')}</span>
                    <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </>
                )}
            </button>

            {!isFinishingProfile && (
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
            )}

            {isFinishingProfile && (
              <div className="text-center mt-6 flex flex-col gap-3">
                <button 
                  type="button"
                  onClick={() => signOut(auth)}
                  className="text-gray-500 text-xs font-bold hover:text-gray-400"
                >
                  Sign out and try again
                </button>
                <button 
                  type="button"
                  onClick={handleResetApp}
                  className="text-red-500/50 text-[10px] font-bold hover:text-red-400 uppercase tracking-widest"
                >
                  Trouble? Reset App
                </button>
              </div>
            )}
          </form>

          <div className="mt-8 flex flex-col items-center justify-center gap-4">
            <div className="flex items-center justify-center gap-2 text-gray-600 text-[10px] uppercase tracking-[0.2em] font-bold">
              <ShieldCheck className="w-3 h-3" />
              <span>Secure Authentication</span>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center text-gray-600 text-xs flex flex-col gap-4 items-center">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors font-bold uppercase tracking-widest text-[10px]"
            >
              <HelpCircle className="w-4 h-4" />
              How to use
            </button>
            <ThemeToggle />
          </div>
          <span>Sling uses end-to-end encryption for your privacy.</span>
          <button 
            onClick={handleResetApp}
            className="text-gray-800 hover:text-gray-600 transition-colors text-[10px] uppercase tracking-widest font-medium"
          >
            Trouble logging in? Reset App
          </button>
        </div>
      </motion.div>

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
