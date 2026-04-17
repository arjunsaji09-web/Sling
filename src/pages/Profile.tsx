import { useState, useEffect, FormEvent, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, serverTimestamp, limit, Timestamp, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import { db, storage, auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, 
  Send, 
  ShieldCheck, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Info,
  User,
  Lightbulb,
  Flame,
  Heart as HeartIcon,
  Clock,
  HelpCircle,
  Lock,
  Loader2
} from 'lucide-react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { useAuth, useLanguage } from '../App';
import HelpModal from '../components/HelpModal';
import ThemeToggle from '../components/ThemeToggle';
import { MONETAG_DIRECT_LINK, openMonetagLink, checkAdBlock } from '../lib/monetag';

const EMOJIS = ['👀', '🤫', '✨', '👻', '😂', '💀', '🥺', '🤯'];
const PREMIUM_EMOJIS = ['🧿', '👑', '💎', '⚡', '🔥'];

const PROMPTS = [
  "Tell me a secret 🤫",
  "What do you think of me? 🔥",
  "Send me a confession 🥺",
  "Rate my profile 1-10 ✨",
  "Ship me with someone 🚢"
];

export default function Profile() {
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();
  const { username } = useParams<{ username: string }>();
  const [recipientUid, setRecipientUid] = useState<string | null>(null);
  const [recipientPhoto, setRecipientPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [senderName, setSenderName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('👻');
  const [loading, setLoading] = useState(true);
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [mode, setMode] = useState<'normal' | 'roast' | 'flirt'>('normal');
  const [cooldown, setCooldown] = useState(0);
  const [selfDestruct, setSelfDestruct] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [unlockedEmojis, setUnlockedEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('sling_premium_emojis');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [unlockingEmoji, setUnlockingEmoji] = useState<string | null>(null);
  const [unlockTimer, setUnlockTimer] = useState(0);
  const [adBlockDetected, setAdBlockDetected] = useState(false);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (unlockTimer > 0) {
      const timer = setTimeout(() => {
        if (unlockTimer === 1) {
          if (unlockingEmoji) {
            const newUnlocked = [...unlockedEmojis, unlockingEmoji];
            setUnlockedEmojis(newUnlocked);
            localStorage.setItem('sling_premium_emojis', JSON.stringify(newUnlocked));
            setUnlockingEmoji(null);
          }
        }
        setUnlockTimer(unlockTimer - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [unlockTimer, unlockingEmoji, unlockedEmojis]);

  const handleEmojiClick = async (emoji: string, isPremium: boolean) => {
    if (isPremium && !unlockedEmojis.includes(emoji)) {
      setAdBlockDetected(false); // Reset
      const isBlocked = await checkAdBlock();
      if (isBlocked) {
        setAdBlockDetected(true);
        return;
      }
      setUnlockingEmoji(emoji);
      setUnlockTimer(15);
      openMonetagLink();
      return;
    }
    setSelectedEmoji(emoji);
  };

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
    if (/Android/i.test(ua)) return "Android";
    if (/Windows/i.test(ua)) return "Windows PC";
    if (/Mac/i.test(ua)) return "Mac";
    return "Web Device";
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (!username || fetchingRef.current) return;
      fetchingRef.current = true;
      
      try {
        const sanitizedUsername = username.replace(/\/$/, '').toLowerCase();
        
        // 1. Try Cache First (Fast loading)
        const cached = localStorage.getItem(`profile_cache_${sanitizedUsername}`);
        if (cached) {
          try {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < 1000 * 60 * 60 * 24) { // 24 hour cache
              setRecipientUid(data.uid);
              if (data.photoURL) setRecipientPhoto(data.photoURL);
              setLoading(false);
            }
          } catch (e) {
            console.warn('Cache parse error', e);
          }
        }

        if (loading) {
          setFetchingProfile(true);
        }
        setError('');
        
        // 2. Fetch from network
        let usernameDoc = await getDoc(doc(db, 'usernames', sanitizedUsername));
        
        if (!usernameDoc.exists() && username !== sanitizedUsername) {
          usernameDoc = await getDoc(doc(db, 'usernames', username));
        }

        if (!usernameDoc.exists() && username.includes('@')) {
          const q = query(collection(db, 'usernames'), where('email', '==', username.toLowerCase()));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            usernameDoc = querySnapshot.docs[0];
          }
        }
        
        if (usernameDoc.exists()) {
          const userData = usernameDoc.data();
          setRecipientUid(userData.uid);
          if (userData.photoURL) setRecipientPhoto(userData.photoURL);
          
          // Update cache
          localStorage.setItem(`profile_cache_${sanitizedUsername}`, JSON.stringify({
            uid: userData.uid,
            photoURL: userData.photoURL,
            timestamp: Date.now()
          }));
        } else {
          setError('User not found');
        }
      } catch (err: any) {
        console.error('Error loading user profile:', err);
        handleFirestoreError(err, OperationType.GET, `usernames/${username}`);
        setError('Permission denied or error loading profile');
      } finally {
        setLoading(false);
        setFetchingProfile(false);
        fetchingRef.current = false;
      }
    };
    fetchUser();
  }, [username]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (!recipientUid) return;
    if (cooldown > 0) {
      setSendError(`Please wait ${cooldown}s before sending another message.`);
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      // Ensure user is signed in (even anonymously)
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (authErr: any) {
          console.error('Anonymous auth failed:', authErr);
          if (authErr.code === 'auth/admin-restricted-operation') {
            setSendError('Anonymous messaging is currently disabled. Please contact the administrator to enable "Anonymous" sign-in in Firebase Console.');
          } else {
            setSendError('Authentication failed. Please try again.');
          }
          setSending(false);
          return;
        }
      }

      // Check if blocked
      if (auth.currentUser && recipientUid) {
        const blockId = `${recipientUid}_${auth.currentUser.uid}`;
        const blockDoc = await getDoc(doc(db, 'blocks', blockId));
        if (blockDoc.exists()) {
          setSendError('You have been blocked by this user.');
          setSending(false);
          return;
        }
      }

      // Daily limit check (100 messages)
      const today = new Date().toISOString().split('T')[0];
      const limitKey = `sling_limit_${today}`;
      const sentToday = parseInt(localStorage.getItem(limitKey) || '0');
      
      if (sentToday >= 100) {
        setSendError(t('rate_limit'));
        setSending(false);
        return;
      }

      const expiresAt = selfDestruct ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
      
      // Robust location fetching with multiple fallbacks
      const getLocationData = async () => {
        const services = [
          { url: 'https://ipapi.co/json/', field: 'city', countryField: 'country_name' },
          { url: 'https://freeipapi.com/api/json', field: 'cityName', countryField: 'countryName' },
          { url: 'https://ip-api.com/json/', field: 'city', countryField: 'country' }
        ];

        for (const service of services) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(service.url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (res.ok) {
              const data = await res.json();
              if (data[service.field]) {
                return { 
                  city: data[service.field], 
                  country: data[service.countryField] || 'Unknown' 
                };
              }
            }
          } catch (e) {
            console.warn(`Location service ${service.url} failed:`, e);
          }
        }
        return { city: 'Unknown City', country: 'Unknown' };
      };

      const { city, country } = await getLocationData();
      
      await addDoc(collection(db, 'messages'), {
        text: message.trim() || '',
        senderName: senderName.trim() || 'Anonymous',
        deviceInfo: getDeviceInfo(),
        senderCity: city,
        senderCountry: country,
        mode,
        recipientUid,
        senderUid: auth.currentUser?.uid || null,
        voiceData: null,
        mediaData: null,
        mediaType: null,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
        emoji: selectedEmoji
      });

      // Update daily limit
      localStorage.setItem(limitKey, (sentToday + 1).toString());

      setSent(true);
      setMessage('');
      setSenderName('');
      setCooldown(10); // 10s cooldown
    } catch (err: any) {
      console.error('Send Error:', err);
      handleFirestoreError(err, OperationType.CREATE, 'messages');
      setSendError('Failed to send message. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-theme p-6 flex flex-col items-center relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[120px] rounded-full" />

        <header className="w-full max-w-md flex items-center justify-between mb-12 z-10 opacity-50">
          <div className="p-2">
            <ArrowLeft className="w-6 h-6 text-gray-400" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/5 rounded-xl animate-pulse" />
            <span className="logo-text text-lg text-theme opacity-50 italic">Sling</span>
          </div>
          <div className="w-6 h-6 bg-white/5 rounded animate-pulse" />
        </header>

        <div className="w-full max-w-md z-10">
          <div className="glass p-8 rounded-[2.5rem] relative">
            <div className="flex flex-col items-center mb-8">
              <div className="w-20 h-20 rounded-full bg-white/5 border-2 border-white/5 animate-pulse mb-4" />
              <div className="h-6 w-48 bg-white/5 rounded-full animate-pulse mb-2" />
              <div className="h-8 w-32 bg-purple-500/10 rounded-full animate-pulse" />
            </div>

            <div className="space-y-4">
              <div className="h-4 w-24 bg-white/5 rounded ml-1 animate-pulse" />
              <div className="flex gap-2 mb-4 overflow-hidden">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-8 w-32 bg-white/5 rounded-full shrink-0" />
                ))}
              </div>
              <div className="w-full h-[160px] bg-white/5 rounded-3xl animate-pulse" />
              <div className="h-10 w-full bg-white/5 rounded-2xl animate-pulse" />
              <div className="h-14 w-full gradient-bg opacity-20 rounded-2xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a0a]">
        <div className="glass p-12 rounded-[2rem] text-center max-w-sm">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">{error}</h2>
          <p className="text-gray-400 mb-8">
            {error.includes('not found') 
              ? "The user you're looking for doesn't exist or has been removed." 
              : "We encountered an issue loading this profile. Please try again."}
          </p>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()} 
              className="gradient-bg px-8 py-3 rounded-xl font-bold"
            >
              Try Again
            </button>
            <Link to="/" className="text-gray-500 hover:text-white transition-colors text-sm font-bold">
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme p-6 flex flex-col items-center relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[120px] rounded-full" />

      <header className="w-full max-w-md flex items-center justify-between mb-12 z-10">
        <Link to="/" className="p-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="logo-text text-lg text-theme">Sling</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHelp(true)}
            className="p-2 text-purple-400 hover:text-purple-300 transition-colors"
          >
            <Sparkles className="w-6 h-6" />
          </button>
        </div>
      </header>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <AnimatePresence mode="wait">
          {!sent ? (
            <motion.div 
              key="form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass p-8 rounded-[2.5rem] relative"
            >
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-white/10 flex items-center justify-center mb-4 overflow-hidden">
                  {recipientPhoto ? (
                    <img src={recipientPhoto} alt={username} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                  ) : (
                    <span className="text-3xl font-bold gradient-text">@{username?.charAt(0)?.toUpperCase() || '?'}</span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-theme">{t('send_anonymous')}</h2>
                <p className="text-purple-400 font-bold text-lg">@{username}</p>
              </div>

              <form onSubmit={handleSendMessage} className="space-y-6">
                {/* Prompts */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                    <Lightbulb className="w-3 h-3" />
                    {t('need_idea')}
                  </div>
                  <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar">
                    {PROMPTS.map((prompt, idx) => (
                      <motion.button
                        key={prompt}
                        type="button"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setMessage(prompt)}
                        className="whitespace-nowrap bg-white/5 border border-white/10 px-4 py-2 rounded-full text-xs font-medium transition-all text-theme"
                      >
                        {prompt}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                    placeholder={
                      mode === 'roast' ? "Roast me! 😈" : 
                      mode === 'flirt' ? "Say something sweet... ❤️" : 
                      "Send me anonymous messages! 👀"
                    }
                    className={cn(
                      "w-full input-theme rounded-3xl p-6 min-h-[160px] focus:outline-none focus:ring-2 transition-all placeholder:text-gray-400 resize-none text-lg leading-relaxed",
                      mode === 'roast' ? "focus:ring-orange-500/50" : 
                      mode === 'flirt' ? "focus:ring-pink-500/50" : 
                      "focus:ring-purple-500/50"
                    )}
                    disabled={sending}
                  />
                  <div className="absolute bottom-4 right-6 text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {message.length}/500
                  </div>
                </div>

                {/* Mode Toggle */}
                <div className="flex bg-theme p-1 rounded-2xl gap-1 relative overflow-hidden border border-white/5">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setMode('normal')}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative z-10",
                      mode === 'normal' ? "bg-white/10 text-theme" : "text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {t('normal')}
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setMode('roast')}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative z-10",
                      mode === 'roast' ? "bg-orange-500/20 text-orange-400" : "text-gray-500 hover:text-orange-400/50"
                    )}
                  >
                    <Flame className={cn("w-3 h-3", mode === 'roast' && "animate-pulse")} />
                    {t('roast')}
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setMode('flirt')}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative z-10",
                      mode === 'flirt' ? "bg-pink-500/20 text-pink-400" : "text-gray-500 hover:text-pink-400/50"
                    )}
                  >
                    <HeartIcon className={cn("w-3 h-3", mode === 'flirt' && "animate-bounce")} />
                    {t('flirt')}
                  </motion.button>
                </div>

                {/* Self Destruct Toggle */}
                <div className="flex items-center justify-between bg-theme p-4 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                      selfDestruct ? "bg-red-500/20 text-red-400" : "bg-white/10 text-gray-400"
                    )}>
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Self-destruct</p>
                      <p className="text-[10px] text-gray-500">Message expires in 24h</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelfDestruct(!selfDestruct)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      selfDestruct ? "bg-red-500" : "bg-white/10"
                    )}
                  >
                    <motion.div 
                      animate={{ x: selfDestruct ? 24 : 4 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>

                {/* Optional Name */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value.slice(0, 30))}
                    placeholder="Your Name or Hint (Optional)"
                    className="w-full input-theme rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-400"
                    disabled={sending}
                  />
                </div>

                {/* Emoji Selection */}
                <div className="space-y-4">
                  <div className="flex flex-wrap justify-center gap-3">
                    {EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleEmojiClick(emoji, false)}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all hover:scale-110 active:scale-95",
                          selectedEmoji === emoji ? "bg-purple-500/20 border border-purple-500/50" : "bg-white/5 border border-white/5"
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{t('premium_emojis')}</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {PREMIUM_EMOJIS.map(emoji => {
                        const isUnlocked = unlockedEmojis.includes(emoji);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleEmojiClick(emoji, true)}
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all relative group overflow-hidden",
                              selectedEmoji === emoji 
                                ? "bg-amber-500/20 border border-amber-500/50" 
                                : isUnlocked 
                                  ? "bg-white/5 border border-white/5" 
                                  : "bg-black/40 border border-white/5 opacity-80"
                            )}
                          >
                            <span className={cn(!isUnlocked && "blur-[2px] grayscale")}>{emoji}</span>
                            {!isUnlocked && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Lock className="w-3 h-3 text-amber-500" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {unlockingEmoji && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
                  >
                    <div className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center text-5xl mb-6 shadow-[0_0_50px_rgba(245,158,11,0.3)] border border-amber-500/50">
                      {unlockingEmoji}
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">{t('unlocking')}</h3>
                    <p className="text-gray-400 text-sm max-w-xs mb-8">
                      {t('keep_ad_open')}
                    </p>
                    
                    <div className="relative w-20 h-20 flex items-center justify-center mb-8">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="40"
                          cy="40"
                          r="36"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="transparent"
                          className="text-white/10"
                        />
                        <motion.circle
                          cx="40"
                          cy="40"
                          r="36"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="transparent"
                          strokeDasharray={226}
                          animate={{ strokeDashoffset: 226 - (unlockTimer / 15) * 226 }}
                          className="text-amber-500"
                        />
                      </svg>
                      <span className="absolute text-2xl font-mono font-bold text-amber-500">{unlockTimer}s</span>
                    </div>

                    <button 
                      onClick={() => {
                        setUnlockingEmoji(null);
                        setUnlockTimer(0);
                      }}
                      className="text-gray-500 hover:text-white transition-colors text-sm font-bold underline underline-offset-4"
                    >
                      {t('cancel')}
                    </button>
                  </motion.div>
                )}

                {/* AdBlock Warning Overlay */}
                {adBlockDetected && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
                  >
                    <div className="w-20 h-20 bg-red-500/20 rounded-3xl flex items-center justify-center text-red-400 mb-6 shadow-lg shadow-red-500/10">
                      <AlertCircle className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">{t('adblock_detected')}</h3>
                    <p className="text-gray-400 text-sm max-w-xs mb-10 leading-relaxed">
                      {t('disable_adblock_msg')}
                    </p>
                    
                    <button 
                      onClick={() => setAdBlockDetected(false)}
                      className="gradient-bg text-white px-12 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-xl shadow-purple-500/20"
                    >
                      {t('got_it')}
                    </button>
                  </motion.div>
                )}

                {sendError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-400 text-sm font-medium"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p>{sendError}</p>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={sending || message.length === 0 || cooldown > 0}
                  className={cn(
                    "w-full gradient-bg py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100",
                    sending && "animate-pulse",
                    mode === 'roast' && "from-orange-600 to-red-600 shadow-orange-500/20",
                    mode === 'flirt' && "from-pink-600 to-rose-600 shadow-pink-500/20"
                  )}
                >
                  {cooldown > 0 ? (
                    <span className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Wait {cooldown}s
                    </span>
                  ) : (
                    <>
                      {sending ? t('sending') : t('send')}
                      {!sending && <Send className="w-5 h-5" />}
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 flex items-center justify-center gap-2 text-gray-500 text-xs font-medium">
                <ShieldCheck className="w-4 h-4" />
                <span>Encrypted & Anonymous</span>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass p-12 rounded-[2.5rem] text-center"
            >
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Message Sent!</h2>
              <p className="text-gray-400 mb-10 leading-relaxed">
                Your message has been sent anonymously to <span className="text-purple-400 font-bold">@{username}</span>.
              </p>
              
              <div className="space-y-4">
                <button 
                  onClick={() => setSent(false)}
                  className="w-full bg-theme hover:bg-white/5 border border-white/10 py-4 rounded-2xl font-bold transition-all"
                >
                  Send Another
                </button>
                <Link 
                  to="/"
                  className="w-full gradient-bg py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Create Your Own
                  <Sparkles className="w-5 h-5" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-12 text-center flex flex-col items-center gap-6">
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
          <p className="text-theme text-sm flex items-center justify-center gap-2 opacity-60">
            <Info className="w-4 h-4" />
            Messages are deleted after 30 days.
          </p>
        </div>
      </motion.div>

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
