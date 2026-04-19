import { useState, useEffect, FormEvent, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, serverTimestamp, limit, Timestamp, doc, getDoc, setDoc, increment, onSnapshot, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import { db, storage, auth, messaging, getToken } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, 
  Send, 
  ShieldCheck, 
  ArrowLeft, 
  ArrowRight,
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
  Loader2,
  Ghost,
  Bell,
  Bookmark
} from 'lucide-react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { useAuth, useLanguage } from '../App';
import HelpModal from '../components/HelpModal';
import ThemeToggle from '../components/ThemeToggle';
import { MONETAG_DIRECT_LINK, openMonetagLink, checkAdBlock } from '../lib/monetag';

const EMOJIS = ['👀', '🤫', '✨', '👻', '😂', '💀', '🥺', '🤯'];
const PREMIUM_EMOJIS = ['🧿', '👑', '💎', '⚡', '🔥'];
const PREMIUM_STICKERS = [
  { id: 'heart_fire', char: '❤️‍🔥' },
  { id: 'alien', char: '👽' },
  { id: 'money', char: '💰' },
  { id: 'rocket', char: '🚀' },
  { id: 'cool', char: '😎' }
];

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
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'info' | 'error' } | null>(null);
  const [unlockedEmojis, setUnlockedEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('sling_premium_emojis');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [unlockedStickers, setUnlockedStickers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('sling_premium_stickers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [unlockingEmoji, setUnlockingEmoji] = useState<string | null>(null);
  const [unlockingSticker, setUnlockingSticker] = useState<string | null>(null);
  const [unlockTimer, setUnlockTimer] = useState(0);
  const [adBlockDetected, setAdBlockDetected] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [guestId] = useState<string>(() => {
    let gid = localStorage.getItem('sling_guest_id');
    if (!gid) {
      gid = `guest_${Math.floor(Math.random() * 9000) + 1000}`;
      localStorage.setItem('sling_guest_id', gid);
    }
    return gid;
  });
  const fetchingRef = useRef(false);

  useEffect(() => {
    const initAuth = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn('Anonymous auth failed on mount:', e);
        }
      }
    };
    initAuth();
  }, []);

  const activeConversationId = (auth.currentUser?.uid && recipientUid) 
    ? [auth.currentUser.uid, recipientUid].sort().join('_') 
    : null;

  // Listen for chat history
  useEffect(() => {
    if (!activeConversationId) return;
    
    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', activeConversationId),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      // Sort client-side to avoid composite index requirement
      msgs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || Date.now();
        const timeB = b.createdAt?.toMillis?.() || Date.now();
        return timeA - timeB;
      });
      
      setChatMessages(msgs);
    }, (err) => {
      console.error('Chat history subscription error:', err);
    });

    return () => unsubscribe();
  }, [activeConversationId]);

  const showToast = (msg: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const requestNotificationPermission = async () => {
    if (!messaging || !activeConversationId || !auth.currentUser) return;
    
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, { 
          // Replace with your Firebase VAPID key from Console -> Project Settings -> Cloud Messaging -> Web Push certificates
          vapidKey: 'BM-Xh-Placeholder-Get-From-Firebase-Console' 
        });
        
        if (token) {
          await setDoc(doc(db, 'conversations', activeConversationId), {
            [`notificationTokens.${auth.currentUser.uid}`]: token
          }, { merge: true });
          showToast(t('notifications_enabled'), 'success');
        }
      }
    } catch (err) {
      console.error('Notification permission error:', err);
      showToast('Push notifications not configured fully.', 'info');
    } finally {
      setShowNotificationPrompt(false);
    }
  };

  useEffect(() => {
    if (unlockTimer > 0) {
      const timer = setTimeout(() => {
        if (unlockTimer === 1) {
          if (unlockingEmoji) {
            const newUnlocked = [...unlockedEmojis, unlockingEmoji];
            setUnlockedEmojis(newUnlocked);
            localStorage.setItem('sling_premium_emojis', JSON.stringify(newUnlocked));
            setUnlockingEmoji(null);
          } else if (unlockingSticker) {
            const newUnlocked = [...unlockedStickers, unlockingSticker];
            setUnlockedStickers(newUnlocked);
            localStorage.setItem('sling_premium_stickers', JSON.stringify(newUnlocked));
            setUnlockingSticker(null);
          }
        }
        setUnlockTimer(unlockTimer - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [unlockTimer, unlockingEmoji, unlockedEmojis, unlockingSticker, unlockedStickers]);

  const prompts = [
    t('prompt_secret'),
    t('prompt_think'),
    t('prompt_confession'),
    t('prompt_rate'),
    t('prompt_ship')
  ];

  const handleEmojiClick = async (emoji: string, isPremium: boolean, isSticker: boolean = false) => {
    if (isPremium) {
      const isAlreadyUnlocked = isSticker ? unlockedStickers.includes(emoji) : unlockedEmojis.includes(emoji);
      if (!isAlreadyUnlocked) {
        setAdBlockDetected(false);
        const isBlocked = await checkAdBlock();
        if (isBlocked) {
          setAdBlockDetected(true);
          return;
        }
        if (isSticker) setUnlockingSticker(emoji);
        else setUnlockingEmoji(emoji);
        setUnlockTimer(15);
        openMonetagLink();
        return;
      }
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
        // Try all potential checks in parallel for speed
        const [primaryDoc, fallbackDoc] = await Promise.all([
          getDoc(doc(db, 'usernames', sanitizedUsername)),
          username !== sanitizedUsername ? getDoc(doc(db, 'usernames', username)) : Promise.resolve(null)
        ]);
        
        let usernameDoc = primaryDoc.exists() ? primaryDoc : (fallbackDoc?.exists() ? fallbackDoc : null);
        
        // If still not found and looks like email
        if (!usernameDoc && username.includes('@')) {
          const q = query(collection(db, 'usernames'), where('email', '==', username.toLowerCase()), limit(1));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            usernameDoc = querySnapshot.docs[0];
          }
        }
        
        if (usernameDoc) {
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
          setSendError('Authentication failed. Please try again.');
          setSending(false);
          return;
        }
      }

      // Check if blocked...
      if (auth.currentUser && recipientUid) {
        const blockId = `${recipientUid}_${auth.currentUser.uid}`;
        const blockDoc = await getDoc(doc(db, 'blocks', blockId));
        if (blockDoc.exists()) {
          setSendError('You have been blocked by this user.');
          setSending(false);
          return;
        }
      }

      const expiresAt = selfDestruct ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
      
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
                return { city: data[service.field], country: data[service.countryField] || 'Unknown' };
              }
            }
          } catch (e) { console.warn(`Location service failed:`, e); }
        }
        return { city: 'Unknown City', country: 'Unknown' };
      };

      const { city, country } = await getLocationData();
      const conversationId = [auth.currentUser.uid, recipientUid].sort().join('_');
      
      await setDoc(doc(db, 'conversations', conversationId), {
        participants: [auth.currentUser.uid, recipientUid],
        lastMessage: message.trim(),
        lastMessageAt: serverTimestamp(),
        [`unreadCount.${recipientUid}`]: increment(1),
        guestStatus: {
          [auth.currentUser.uid]: !currentUser
        }
      }, { merge: true });

      await addDoc(collection(db, 'messages'), {
        text: message.trim() || '',
        senderName: senderName.trim() || guestId,
        deviceInfo: getDeviceInfo(),
        senderCity: city,
        senderCountry: country,
        mode,
        recipientUid,
        senderUid: auth.currentUser?.uid || null,
        conversationId,
        participants: [auth.currentUser?.uid, recipientUid],
        createdAt: serverTimestamp(),
        expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
        emoji: selectedEmoji
      });

      if (!currentUser && !localStorage.getItem('sling_notifications_requested')) {
        setShowNotificationPrompt(true);
      }

      setSent(true);
      setMessage('');
      setCooldown(10);
    } catch (err: any) {
      console.error('Send Error:', err);
      setSendError('Failed to send. Please try again.');
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
              ? t('user_not_found') 
              : t('load_error')}
          </p>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()} 
              className="gradient-bg px-8 py-3 rounded-xl font-bold"
            >
              {t('try_again')}
            </button>
            <Link to="/" className="text-gray-500 hover:text-white transition-colors text-sm font-bold">
              {t('go_home')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme p-6 flex flex-col items-center relative overflow-hidden">
      {/* Ad Countdown Overlay */}
      <AnimatePresence>
        {unlockTimer > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/98 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="relative z-10 w-full max-w-sm">
              <div className="mb-12 relative">
                <svg className="w-32 h-32 mx-auto rotate-[-90deg]">
                  <circle cx="64" cy="64" r="60" fill="none" stroke="white" strokeWidth="4" className="opacity-10" />
                  <motion.circle
                    cx="64" cy="64" r="60" fill="none" stroke="#a855f7" strokeWidth="4"
                    strokeDasharray="377"
                    animate={{ strokeDashoffset: 377 - (377 * unlockTimer) / 15 }}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-white">{unlockTimer}</div>
              </div>
              <h3 className="text-2xl font-black text-white mb-4 uppercase tracking-widest">{t('verifying')}...</h3>
              <p className="text-gray-400 text-sm mb-8">{t('do_not_close')}</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => openMonetagLink()} 
                  className="w-full bg-white/10 hover:bg-white/20 text-white py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  {t('link_not_opening')}
                </button>
                <button 
                  onClick={() => {
                    setUnlockTimer(0);
                    setUnlockingEmoji(null);
                    setUnlockingSticker(null);
                  }} 
                  className="text-gray-600 text-[10px] font-bold uppercase py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AdBlock Detected Overlay */}
      <AnimatePresence>
        {adBlockDetected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="glass p-8 rounded-[2.5rem] max-w-sm w-full text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Ad-Blocker Detected</h3>
              <p className="text-gray-400 text-sm mb-6">Please disable your ad-blocker to unlock premium reactions.</p>
              <button 
                onClick={() => setAdBlockDetected(false)} 
                className="w-full gradient-bg py-4 rounded-xl font-bold uppercase text-xs text-white"
              >
                Got it
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        {/* Guest Banner */}
        {!currentUser && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 bg-purple-500/10 border border-purple-500/20 p-3 rounded-2xl flex items-center justify-between gap-3 text-purple-400"
          >
            <div className="flex items-center gap-2">
              <Ghost className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none">{t('chatting_ano')} <span className="text-white">{guestId}</span></span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold">
              <Bookmark className="w-3 h-3" />
              <span>{t('bookmark_this')}</span>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {!currentUser ? (
            <motion.div 
              key="unlock-lock"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass p-8 rounded-[2.5rem] relative overflow-hidden border-2 border-purple-500/30 shadow-[0_20px_50px_rgba(168,85,247,0.2)]"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-purple-600/10 to-transparent" />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6 shadow-xl transform -rotate-6">
                  <Lock className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white mb-3 tracking-tight">{t('verification_required')} 🔓</h2>
                <p className="text-gray-400 text-xs mb-8 leading-relaxed max-w-[240px]">
                  {t('registration_msg')}
                </p>
                
                <Link 
                  to="/signup"
                  className="w-full gradient-bg py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {t('unlock_chat_button')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                
                <p className="mt-4 text-[10px] text-gray-500 font-bold uppercase tracking-widest opacity-50">
                  {t('join_seconds')}
                </p>
              </div>
            </motion.div>
          ) : !sent ? (
            <div className="space-y-4">
              {/* Previous Messages (Ghost Chat) */}
              {chatMessages.length > 0 && (
                <div className="relative group">
                  <div className={cn(
                    "glass p-4 rounded-[2rem] max-h-[300px] overflow-y-auto no-scrollbar space-y-3 mb-4 transition-all duration-700",
                    !currentUser && "blur-[8px] select-none pointer-events-none opacity-60"
                  )}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <MessageCircle className="w-3 h-3 text-purple-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('history')}</span>
                    </div>
                    {chatMessages.map((msg, i) => (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, x: msg.senderUid === auth.currentUser?.uid ? 10 : -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                          "flex flex-col max-w-[85%]",
                          msg.senderUid === auth.currentUser?.uid ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                      >
                        <div className={cn(
                          "p-3 rounded-2xl text-xs font-medium break-words",
                          msg.senderUid === auth.currentUser?.uid 
                            ? "bg-purple-600 text-white rounded-tr-none" 
                            : "bg-white/5 border border-white/10 text-theme rounded-tl-none"
                        )}>
                          {msg.text}
                        </div>
                        <span className="text-[9px] text-gray-500 mt-1 px-1">
                          {msg.createdAt?.toDate 
                            ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                            : 'Just now'}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                  {!currentUser && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                      <div className="bg-purple-500/10 px-4 py-2 rounded-full border border-purple-500/30 backdrop-blur-sm flex items-center gap-2">
                        <Lock className="w-3 h-3 text-purple-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">{t('sneak_peek')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                    {prompts.map((prompt, idx) => (
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
                      mode === 'roast' ? t('roast_me') : 
                      mode === 'flirt' ? t('sweet_msg') : 
                      t('anonymous_placeholder')
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
                      <p className="text-xs font-bold text-white">{t('self_destruct')}</p>
                      <p className="text-[10px] text-gray-500">{t('expires_in_24h')}</p>
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
                    placeholder={t('your_name_hint')}
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
                            onClick={() => handleEmojiClick(emoji, true, false)}
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

                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{t('premium_stickers')}</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {PREMIUM_STICKERS.map(sticker => {
                        const isUnlocked = unlockedStickers.includes(sticker.char);
                        return (
                          <button
                            key={sticker.id}
                            type="button"
                            onClick={() => handleEmojiClick(sticker.char, true, true)}
                            className={cn(
                              "w-14 h-14 rounded-2xl flex items-center justify-center text-3xl transition-all relative group overflow-hidden",
                              selectedEmoji === sticker.char 
                                ? "bg-purple-500/20 border border-purple-500/50" 
                                : isUnlocked 
                                  ? "bg-white/5 border border-white/5" 
                                  : "bg-black/40 border border-white/5 opacity-80"
                            )}
                          >
                            <span className={cn(!isUnlocked && "blur-[4px] grayscale scale-90")}>{sticker.char}</span>
                            {!isUnlocked && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Sparkles className="w-4 h-4 text-purple-400" />
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
                      {t('wait_seconds')} {cooldown}s
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
                <span>{t('encrypted_anonymous')}</span>
              </div>
              </motion.div>
            </div>
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
              <h2 className="text-3xl font-bold mb-4">{t('message_sent')}</h2>
              <p className="text-gray-400 mb-10 leading-relaxed">
                {t('sent_to')} <span className="text-purple-400 font-bold">@{username}</span>.
              </p>
              
              <div className="space-y-4">
                <button 
                  onClick={() => setSent(false)}
                  className="w-full bg-theme hover:bg-white/5 border border-white/10 py-4 rounded-2xl font-bold transition-all"
                >
                  {t('send_another')}
                </button>
                <Link 
                  to="/"
                  className="w-full gradient-bg py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  {t('create_own')}
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
              {t('how_to_use_btn')}
            </button>
            <ThemeToggle />
          </div>
          <p className="text-theme text-sm flex items-center justify-center gap-2 opacity-60">
            <Info className="w-4 h-4" />
            {t('messages_auto_delete')}
          </p>
        </div>
      </motion.div>

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Notification Prompt */}
      <AnimatePresence>
        {showNotificationPrompt && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-6 right-6 z-[110] max-w-md mx-auto"
          >
            <div className="glass p-6 rounded-3xl shadow-2xl border-white/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400">
                  <Bell className="w-6 h-6 animate-swing" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-theme">{t('stay_updated')}</h3>
                  <p className="text-[10px] text-gray-500">{t('enable_notifications_msg')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    localStorage.setItem('sling_notifications_requested', 'true');
                    setShowNotificationPrompt(false);
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-gray-400"
                >
                  {t('maybe_later')}
                </button>
                <button 
                  onClick={requestNotificationPermission}
                  className="flex-1 gradient-bg py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white shadow-lg shadow-purple-500/20"
                >
                  {t('enable_now')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[200]"
          >
            <div className={cn(
              "px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-xl border font-bold text-xs uppercase tracking-widest",
              toast.type === 'success' ? "bg-green-500/20 border-green-500/30 text-green-400" :
              toast.type === 'error' ? "bg-red-500/20 border-red-500/30 text-red-400" :
              "bg-purple-500/20 border-purple-500/30 text-purple-400"
            )}>
              {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
              {toast.msg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
