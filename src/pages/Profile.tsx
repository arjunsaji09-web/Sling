import { useState, useEffect, FormEvent } from 'react';
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
  HelpCircle
} from 'lucide-react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { useAuth, useLanguage } from '../App';
import HelpModal from '../components/HelpModal';
import ThemeToggle from '../components/ThemeToggle';

const EMOJIS = ['👀', '🔥', '❤️', '🤫', '✨', '👻', '😂', '💀', '🥺', '🤯'];

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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'normal' | 'roast' | 'flirt'>('normal');
  const [cooldown, setCooldown] = useState(0);
  const [selfDestruct, setSelfDestruct] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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
      if (!username) return;
      try {
        // Ensure user is signed in (even anonymously) to allow for blocking and security rules
        if (!currentUser && !auth.currentUser) {
          await signInAnonymously(auth);
        }

        // Use getDoc directly on the document ID for better performance and reliability
        const sanitizedUsername = username.replace(/\/$/, '').toLowerCase();
        let usernameDoc = await getDoc(doc(db, 'usernames', sanitizedUsername));
        
        if (!usernameDoc.exists() && username !== sanitizedUsername) {
          usernameDoc = await getDoc(doc(db, 'usernames', username));
        }
        
        if (usernameDoc.exists()) {
          const userData = usernameDoc.data();
          setRecipientUid(userData.uid);
          
          if (userData.photoURL) {
            setRecipientPhoto(userData.photoURL);
          } else {
            try {
              const userDoc = await getDoc(doc(db, 'users', userData.uid));
              if (userDoc.exists()) {
                setRecipientPhoto(userDoc.data().photoURL || null);
              }
            } catch (e) {
              // Silent fail
            }
          }
        } else {
          setError('User not found');
        }
      } catch (err) {
        setError('Error loading user');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [username, currentUser]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (!recipientUid) return;
    if (cooldown > 0) {
      setError(`Please wait ${cooldown}s before sending another message.`);
      return;
    }

    setSending(true);
    setError('');

    try {
      // Check if blocked
      if (currentUser && recipientUid) {
        const blockId = `${recipientUid}_${currentUser.uid}`;
        const blockDoc = await getDoc(doc(db, 'blocks', blockId));
        if (blockDoc.exists()) {
          setError('You have been blocked by this user.');
          setSending(false);
          return;
        }
      }

      // Daily limit check (100 messages)
      const today = new Date().toISOString().split('T')[0];
      const limitKey = `sling_limit_${today}`;
      const sentToday = parseInt(localStorage.getItem(limitKey) || '0');
      
      if (sentToday >= 100) {
        setError(t('rate_limit'));
        setSending(false);
        return;
      }

      const expiresAt = selfDestruct ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
      
      await addDoc(collection(db, 'messages'), {
        text: message.trim() || '',
        senderName: senderName.trim() || 'Anonymous',
        deviceInfo: getDeviceInfo(),
        mode,
        recipientUid,
        senderUid: currentUser?.uid || null,
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
      setError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a0a]">
        <div className="glass p-12 rounded-[2rem] text-center max-w-sm">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">{error}</h2>
          <p className="text-gray-400 mb-8">The user you're looking for doesn't exist or has been removed.</p>
          <Link to="/" className="gradient-bg px-8 py-3 rounded-xl font-bold inline-block">
            Go Home
          </Link>
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
                <div className="flex flex-wrap justify-center gap-3">
                  {EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedEmoji(emoji)}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all hover:scale-110 active:scale-95",
                        selectedEmoji === emoji ? "bg-purple-500/20 border border-purple-500/50" : "bg-white/5 border border-white/5"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

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
