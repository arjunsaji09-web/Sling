import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, addDoc, serverTimestamp, getDocs, limit, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, auth, storage } from '../lib/firebase';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, 
  Share2, 
  Copy, 
  Trash2, 
  ExternalLink, 
  Check, 
  LogOut, 
  Info,
  AlertCircle,
  Sparkles,
  Heart,
  Smile,
  Zap,
  Search,
  Users,
  ArrowRight,
  Clock,
  Send,
  Camera,
  ImageIcon,
  User as UserIcon,
  Shield,
  HelpCircle
} from 'lucide-react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { Link } from 'react-router-dom';
import HelpModal from '../components/HelpModal';

interface Message {
  id: string;
  text: string;
  createdAt: any;
  recipientUid: string;
  emoji?: string;
  senderName?: string;
  deviceInfo?: string;
  mode?: 'normal' | 'roast' | 'flirt';
  reactions?: { [key: string]: number };
  expiresAt?: any;
  senderUid?: string;
}

const EMOJIS = ['👀', '🔥', '❤️', '🤫', '✨', '👻'];

export default function Dashboard() {
  const { user, username, photoURL, role, refreshUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const cached = localStorage.getItem('sling_messages');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      console.error('Error parsing cached messages:', e);
      return [];
    }
  });
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(messages.length === 0);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'friends'>('inbox');
  const [guessHint, setGuessHint] = useState<string | null>(null);
  const [blurMessage, setBlurMessage] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [lastViewedCount, setLastViewedCount] = useState(0);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{username: string, photoURL?: string}[]>([]);
  const [searching, setSearching] = useState(false);

  // DP Update state
  const [updatingDP, setUpdatingDP] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const profileUrl = `${window.location.href.split('#')[0]}#/${username}`;

  const [showNotification, setShowNotification] = useState(false);
  const [lastMessageCount, setLastMessageCount] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'messages'),
      where('recipientUid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      
      if (lastMessageCount !== null && msgs.length > lastMessageCount) {
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 5000);
      }
      
      setMessages(msgs);
      localStorage.setItem('sling_messages', JSON.stringify(msgs));
      setLastMessageCount(msgs.length);
      setLoading(false);
    }, (error) => {
      // Don't throw here to prevent app crash, just log and set loading false
      console.error('Dashboard Snapshot Error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]); // Removed lastMessageCount from dependencies

  useEffect(() => {
        const searchUsers = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        // Simple search: find usernames starting with query
        const q = query(
          collection(db, 'usernames'),
          orderBy('__name__'),
          where('__name__', '>=', searchQuery.toLowerCase()),
          where('__name__', '<=', searchQuery.toLowerCase() + '\uf8ff'),
          limit(5)
        );
        const snapshot = await getDocs(q);
        
        // Fetch photoURLs for the found users
        const results = await Promise.all(snapshot.docs.map(async (d) => {
          const uid = d.data().uid;
          const userDoc = await getDoc(doc(db, 'users', uid));
          return { 
            username: d.id,
            photoURL: userDoc.exists() ? userDoc.data().photoURL : null
          };
        }));
        
        setSearchResults(results.filter(r => r.username !== username));
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, username]);

  // Expiry cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      messages.forEach(async (msg) => {
        if (msg.expiresAt) {
          try {
            const expiryDate = typeof msg.expiresAt.toDate === 'function' 
              ? msg.expiresAt.toDate() 
              : new Date(msg.expiresAt.seconds * 1000 || msg.expiresAt);
              
            if (expiryDate < now) {
              await deleteDoc(doc(db, 'messages', msg.id));
            }
          } catch (err) {
            console.error("Failed to check/delete expired message", err);
          }
        }
      });
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [messages]);

  const formatMessageDate = (createdAt: any) => {
    if (!createdAt) return 'Just now';
    try {
      if (typeof createdAt.toDate === 'function') {
        return createdAt.toDate().toLocaleDateString();
      }
      // Handle cached date (it might be a string or an object with seconds)
      if (createdAt.seconds) {
        return new Date(createdAt.seconds * 1000).toLocaleDateString();
      }
      return new Date(createdAt).toLocaleDateString();
    } catch (e) {
      return 'Recently';
    }
  };

  const getRemainingTime = (expiresAt: any) => {
    if (!expiresAt) return null;
    try {
      const date = typeof expiresAt.toDate === 'function' ? expiresAt.toDate() : new Date(expiresAt.seconds * 1000 || expiresAt);
      const diff = date.getTime() - Date.now();
      if (diff <= 0) return 'Expired';
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${minutes}m left`;
    } catch (e) {
      return null;
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    const text = `Send me anonymous messages! 👀\n\n${profileUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const deleteMessage = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'messages', id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDPUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Image must be under 2MB', 'error');
      return;
    }

    setUpdatingDP(true);
    setUploadProgress(0);
    try {
      console.log('Starting Upload');
      const storageRef = ref(storage, `profiles/${user.uid}`);
      
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      // Monitor progress
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        }, 
        (error) => {
          console.error('Upload Failed:', error);
        }
      );

      await uploadTask;
      console.log('Upload Complete');
      
      const url = await getDownloadURL(storageRef);
      console.log('URL Retrieved:', url);
      
      await setDoc(doc(db, 'users', user.uid), {
        photoURL: url
      }, { merge: true });
      console.log('Database Updated');
      
      localStorage.setItem('sling_photo', url);
      await refreshUser();
      showToast('Profile picture updated successfully!', 'success');
    } catch (err: any) {
      console.error('DP Update Error:', err);
      let errorMessage = 'Failed to update profile picture.';
      
      if (err.code === 'storage/unauthorized') {
        errorMessage = 'Permission Denied: You do not have permission to upload to storage.';
      } else if (err.code === 'storage/retry-limit-exceeded') {
        errorMessage = 'Network Error: The upload took too long or your connection was lost.';
      } else if (err.code === 'storage/canceled') {
        errorMessage = 'Upload Canceled.';
      } else if (err.message) {
        errorMessage = `Error: ${err.message}`;
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setUpdatingDP(false);
      setUploadProgress(0);
    }
  };

  const logout = () => auth.signOut();

  const updateAvatarStyle = async (style: 'boy' | 'girl' | 'neutral') => {
    if (!user || !username) return;
    setUpdatingDP(true);
    try {
      let avatarStyle = 'avataaars';
      if (style === 'boy') avatarStyle = 'micah';
      if (style === 'girl') avatarStyle = 'lorelei';
      
      const newPhotoURL = `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${username.toLowerCase()}`;
      
      await setDoc(doc(db, 'users', user.uid), {
        photoURL: newPhotoURL,
        avatarType: style
      }, { merge: true });
      
      localStorage.setItem('sling_photo', newPhotoURL);
      await refreshUser();
      showToast('Avatar style updated!', 'success');
      setShowAvatarPicker(false);
    } catch (err: any) {
      console.error('Avatar Update Error:', err);
      showToast('Failed to update avatar style', 'error');
    } finally {
      setUpdatingDP(false);
    }
  };

  const reactToMessage = async (msgId: string, emoji: string) => {
    try {
      const msgRef = doc(db, 'messages', msgId);
      const msg = messages.find(m => m.id === msgId);
      const currentReactions = msg?.reactions || {};
      await updateDoc(msgRef, {
        [`reactions.${emoji}`]: (currentReactions[emoji] || 0) + 1
      });
    } catch (err) {
      console.error(err);
    }
  };

  const sendQuickReply = async (recipientUid: string, text: string) => {
    if (!user) return;
    setSendingReply(true);
    try {
      await addDoc(collection(db, 'messages'), {
        text,
        senderName: username,
        deviceInfo: 'Web',
        mode: 'normal',
        recipientUid,
        senderUid: user.uid,
        createdAt: serverTimestamp(),
        emoji: '🤫'
      });
      setReplyingTo(null);
      setReplyText('');
      // Show success notification or something
    } catch (err) {
      console.error('Error sending reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const getGuessHint = (msg: Message) => {
    const hints = [
      `Name starts with "${msg.senderName?.charAt(0).toUpperCase() || 'A'}"`,
      `Sent from a ${msg.deviceInfo || 'Mobile'}`,
      "Maybe someone from your contacts 👀",
      "They've sent you messages before...",
      "Someone who knows your secret 🤫"
    ];
    setGuessHint(hints[Math.floor(Math.random() * hints.length)]);
  };

  const getSmartReplies = (text: string) => {
    return [
      "Who is this? 👀",
      "Say it directly 😅",
      "I think I know you... 🤫"
    ];
  };

  const addFakeMessage = async () => {
    if (!user) return;
    const fakeMessages = [
      "I've had a crush on you since high school! 🤫",
      "You're literally the coolest person I know. ✨",
      "We should hang out more often! 🔥",
      "I love your style! ❤️",
      "Guess who this is? 👀"
    ];
    const randomMsg = fakeMessages[Math.floor(Math.random() * fakeMessages.length)];
    const randomEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

    await addDoc(collection(db, 'messages'), {
      text: randomMsg,
      recipientUid: user.uid,
      createdAt: serverTimestamp(),
      emoji: randomEmoji
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20">
      {/* Notification */}
      <AnimatePresence>
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm"
          >
            <div className="gradient-bg p-4 rounded-2xl shadow-2xl flex items-center gap-4">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm">New Message! 👻</h4>
                <p className="text-xs text-white/80">Someone just sent you a message.</p>
              </div>
              <button onClick={() => setShowNotification(false)} className="p-1">
                <Check className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[280px]",
              toast.type === 'success' ? "bg-green-500 text-white" : "bg-red-500 text-white"
            )}
          >
            {toast.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="glass sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">Sling</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHelp(true)}
            className="p-2 text-purple-400 hover:text-purple-300 transition-colors"
            title="How to use & Features"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          {role === 'admin' && (
            <Link to="/admin-secure-panel" className="p-2 text-purple-400 hover:text-purple-300 transition-colors">
              <Shield className="w-5 h-5" />
            </Link>
          )}
          <button onClick={logout} className="p-2 text-gray-400 hover:text-white transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 pt-8">
        {/* Tabs */}
        <div className="flex bg-white/5 p-1 rounded-2xl mb-8 relative">
          <button 
            onClick={() => {
              setActiveTab('inbox');
              setShowNotification(false);
            }}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all relative",
              activeTab === 'inbox' ? "bg-white/10 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"
            )}
          >
            <MessageCircle className="w-4 h-4" />
            Inbox
            {showNotification && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-[#0a0a0a] animate-bounce">
                !
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('friends')}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
              activeTab === 'friends' ? "bg-white/10 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"
            )}
          >
            <Users className="w-4 h-4" />
            Find Friends
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'inbox' ? (
            <motion.div
              key="inbox"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* Profile Card */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass p-8 rounded-[2.5rem] mb-12 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Sparkles className="w-24 h-24 text-purple-500" />
                </div>
                
                <div className="flex flex-col items-center text-center relative z-10">
                  <div className="relative group mb-4">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-white/10 flex items-center justify-center overflow-hidden relative group">
                      {photoURL ? (
                        <img src={photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                      ) : (
                        <span className="text-4xl font-bold gradient-text">@{username?.charAt(0)?.toUpperCase() || '?'}</span>
                      )}
                      
                      {/* Avatar Style Picker Overlay */}
                      <AnimatePresence>
                        {showAvatarPicker && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-2 gap-2 backdrop-blur-sm"
                          >
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => updateAvatarStyle('boy')} className="w-full py-1 bg-white/10 rounded-lg text-[10px] font-bold hover:bg-white/20">👦 Boy</motion.button>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => updateAvatarStyle('girl')} className="w-full py-1 bg-white/10 rounded-lg text-[10px] font-bold hover:bg-white/20">👧 Girl</motion.button>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => updateAvatarStyle('neutral')} className="w-full py-1 bg-white/10 rounded-lg text-[10px] font-bold hover:bg-white/20">👤 Neutral</motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {updatingDP && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mb-1" />
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                      className="absolute bottom-0 right-0 p-2 bg-purple-600 rounded-full text-white cursor-pointer shadow-lg hover:scale-110 transition-all z-20"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                  <h2 className="text-2xl font-bold mb-1">@{username}</h2>
                  <p className="text-gray-400 mb-8">Share your link to get messages!</p>

                  <div className="w-full space-y-3">
                    <button 
                      onClick={copyLink}
                      className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    >
                      {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-purple-400" />}
                      <span className="font-medium">{copied ? 'Copied Link!' : 'Copy Link'}</span>
                    </button>
                    
                    <button 
                      onClick={shareWhatsApp}
                      className="w-full gradient-bg py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Share2 className="w-5 h-5" />
                      <span className="font-bold">Share on WhatsApp</span>
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Messages Section */}
              <div className="flex items-center justify-between mb-6 px-2">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-purple-400" />
                  Inbox
                  <span className="bg-white/10 px-2 py-0.5 rounded-full text-xs font-medium text-gray-400">
                    {messages.length}
                  </span>
                </h3>
                {messages.length === 0 && !loading && (
                  <button 
                    onClick={addFakeMessage}
                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                  >
                    <Zap className="w-3 h-3" />
                    Try Demo Message
                  </button>
                )}
              </div>

              {loading && messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-12 h-12 border-4 border-white/10 border-t-purple-500 rounded-full animate-spin" />
                  <p className="text-gray-500 text-sm animate-pulse">Checking for messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass p-12 rounded-[2rem] text-center flex flex-col items-center"
                >
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Info className="w-8 h-8 text-gray-600" />
                  </div>
                  <h4 className="text-lg font-bold mb-2">No messages yet</h4>
                  <p className="text-gray-500 text-sm max-w-[200px]">
                    Share your link with friends to start receiving anonymous messages!
                  </p>
                </motion.div>
              ) : (
                <div className="grid gap-4">
                  <AnimatePresence mode="popLayout">
                    {messages.map((msg, index) => (
                      <motion.div
                        key={msg.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: index * 0.05 }}
                        className="glass p-6 rounded-3xl group relative overflow-hidden"
                      >
                        <div className="flex items-start justify-between relative z-10">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-2xl">{msg.emoji || '👻'}</span>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-purple-400">
                                    From: {msg.senderName || 'Anonymous'}
                                  </span>
                                  {msg.mode && msg.mode !== 'normal' && (
                                    <span className={cn(
                                      "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                                      msg.mode === 'roast' ? "bg-orange-500/20 text-orange-400" : "bg-pink-500/20 text-pink-400"
                                    )}>
                                      {msg.mode}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-gray-500">
                                  {formatMessageDate(msg.createdAt)} • {msg.deviceInfo || 'Web'}
                                </span>
                                {msg.expiresAt && (
                                  <span className="text-[10px] text-red-400 font-bold flex items-center gap-1 mt-1">
                                    <Clock className="w-3 h-3" />
                                    {getRemainingTime(msg.expiresAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-lg font-medium leading-relaxed pr-8 mb-4">
                              {msg.text}
                            </p>

                            {/* Reactions */}
                            <div className="flex flex-wrap gap-2 mb-4">
                              {['❤️', '😂', '😳', '🔥'].map(emoji => (
                                <motion.button
                                  key={emoji}
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => reactToMessage(msg.id, emoji)}
                                  className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-full text-xs flex items-center gap-1 transition-all"
                                >
                                  <span>{emoji}</span>
                                  <span className="text-gray-400 font-bold">{msg.reactions?.[emoji] || 0}</span>
                                </motion.button>
                              ))}
                            </div>

                            {/* Actions & Smart Replies (Vertical Layout) */}
                            <div className="flex flex-col gap-2 mb-6 px-1">
                              <div className="grid grid-cols-3 gap-2">
                                {/* Primary Actions */}
                                <button 
                                  onClick={() => setSelectedMessage(msg)}
                                  className="flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400 hover:text-white transition-colors bg-white/5 px-3 py-3 rounded-xl border border-white/5"
                                >
                                  <Share2 className="w-3 h-3" />
                                  Story
                                </button>
                                
                                <button 
                                  onClick={() => getGuessHint(msg)}
                                  className="flex items-center justify-center gap-2 text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors bg-purple-500/10 px-3 py-3 rounded-xl border border-purple-500/20"
                                >
                                  <Search className="w-3 h-3" />
                                  Guess
                                </button>

                                <button 
                                  onClick={() => setReplyingTo(msg.id)}
                                  className="flex items-center justify-center gap-2 text-[10px] font-bold text-green-400 hover:text-green-300 transition-colors bg-green-500/10 px-3 py-3 rounded-xl border border-green-500/20"
                                >
                                  <Send className="w-3 h-3" />
                                  Reply
                                </button>
                              </div>

                              {/* AI Smart Replies - Vertical List */}
                              <div className="flex flex-col gap-2 mt-1">
                                {getSmartReplies(msg.text).map((reply, idx) => (
                                  <motion.button
                                    key={reply}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    whileHover={{ x: 5, backgroundColor: 'rgba(168, 85, 247, 0.1)' }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => {
                                      setReplyingTo(msg.id);
                                      setReplyText(reply);
                                    }}
                                    className="w-full bg-purple-500/5 border border-purple-500/10 px-4 py-3 rounded-xl text-xs font-medium text-purple-400/80 transition-all flex items-center justify-between group"
                                  >
                                    <span className="truncate flex items-center gap-2">
                                      <Sparkles className="w-3 h-3 opacity-50" />
                                      AI: "{reply}"
                                    </span>
                                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </motion.button>
                                ))}
                              </div>
                            </div>

                            {/* Custom Reply Input */}
                            <AnimatePresence>
                              {replyingTo === msg.id && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="mt-4 space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10"
                                >
                                  {!msg.senderUid ? (
                                    <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl text-xs text-orange-400 flex items-center gap-3">
                                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                      <p>This sender is anonymous and hasn't logged in. You can't reply directly, but you can share this to your Story!</p>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-3">
                                      <div className="relative">
                                        <input 
                                          type="text"
                                          value={replyText}
                                          onChange={(e) => setReplyText(e.target.value)}
                                          placeholder="Type your reply..."
                                          className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-white"
                                          autoFocus
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => sendQuickReply(msg.senderUid!, replyText)}
                                          disabled={!replyText || sendingReply}
                                          className="flex-1 gradient-bg py-4 rounded-xl text-white font-bold shadow-lg shadow-purple-500/20 disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                        >
                                          {sendingReply ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                          ) : (
                                            <>
                                              <Send className="w-5 h-5" />
                                              <span>Send Reply</span>
                                            </>
                                          )}
                                        </button>
                                        <button 
                                          onClick={() => {
                                            setReplyingTo(null);
                                            setReplyText('');
                                          }}
                                          className="px-4 py-4 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-gray-400 transition-colors"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {guessHint && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-xs font-bold text-purple-400 flex items-center gap-2"
                              >
                                <Sparkles className="w-4 h-4" />
                                {guessHint}
                              </motion.div>
                            )}
                          </div>
                          <button 
                            onClick={() => deleteMessage(msg.id)}
                            className="p-2 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        
                        {/* Subtle background decoration */}
                        <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity">
                          <MessageCircle className="w-20 h-20" />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="friends"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="glass p-8 rounded-[2.5rem]">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Search className="w-5 h-5 text-purple-400" />
                  Search Users
                </h3>
                
                <div className="relative mb-8">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter username..."
                    maxLength={20}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-white placeholder:text-gray-600"
                  />
                </div>

                <div className="space-y-4">
                  {searching ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-purple-500"></div>
                    </div>
                  ) : searchQuery.length >= 2 && searchResults.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No users found matching "{searchQuery}"
                    </div>
                  ) : (
                    searchResults.map((res) => (
                      <motion.div 
                        key={res.username}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center font-bold text-purple-400 overflow-hidden">
                            {res.photoURL ? (
                              <img src={res.photoURL} alt={res.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              res.username.charAt(0).toUpperCase()
                            )}
                          </div>
                          <span className="font-bold">@{res.username}</span>
                        </div>
                        <Link 
                          to={`/${res.username}`}
                          className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
                        >
                          Send Message
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </motion.div>
                    ))
                  )}
                  
                  {searchQuery.length < 2 && (
                    <div className="text-center py-12 flex flex-col items-center">
                      <Users className="w-12 h-12 text-gray-700 mb-4" />
                      <p className="text-gray-500 text-sm max-w-[200px]">
                        Type at least 2 characters to search for your friends!
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="glass p-6 rounded-3xl border border-purple-500/20">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-500/10 rounded-2xl">
                    <Sparkles className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Quick Tip</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      You can send anonymous messages to anyone on Sling. Just search their username and tap "Send Message"!
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Action Button for Mobile */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 md:hidden">
        <button 
          onClick={shareWhatsApp}
          className="gradient-bg px-8 py-4 rounded-full font-bold shadow-2xl shadow-purple-500/40 flex items-center gap-2 active:scale-95 transition-all"
        >
          <Share2 className="w-5 h-5" />
          Share Link
        </button>
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {selectedMessage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedMessage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="gradient-bg p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden aspect-[4/5] flex flex-col items-center justify-center text-center">
                {/* Decorative elements */}
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                  <MessageCircle className="absolute -top-10 -left-10 w-40 h-40 rotate-12" />
                  <MessageCircle className="absolute -bottom-10 -right-10 w-40 h-40 -rotate-12" />
                </div>

                <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 w-full relative z-10">
                  <div className="text-5xl mb-6">{selectedMessage.emoji || '👻'}</div>
                  <p className={cn(
                    "text-xl font-bold text-white leading-relaxed mb-6 transition-all",
                    blurMessage && "blur-md select-none"
                  )}>
                    "{selectedMessage.text}"
                  </p>
                  <div className="pt-6 border-t border-white/10">
                    <p className="text-sm font-bold text-white/60">Send me anonymous messages!</p>
                    <p className="text-lg font-black text-white mt-1 uppercase tracking-tighter">
                      {window.location.host}/{username}
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex flex-col items-center gap-4">
                  <button
                    onClick={() => setBlurMessage(!blurMessage)}
                    className="text-white/60 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors"
                  >
                    {blurMessage ? "Unblur Message" : "Blur Message"}
                  </button>
                  <div className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                    Screenshot & Post to Story
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => setSelectedMessage(null)}
                className="w-full mt-6 py-4 text-gray-400 font-bold hover:text-white transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
