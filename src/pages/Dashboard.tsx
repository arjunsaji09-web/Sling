import { useState, useEffect, FormEvent, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, addDoc, serverTimestamp, getDocs, limit, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, auth, storage } from '../lib/firebase';
import { useAuth, useLanguage } from '../App';
import { languages } from '../lib/translations';
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
  HelpCircle,
  Bell,
  BellOff,
  MapPin,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  X,
  Globe,
  AlertTriangle,
  RefreshCw,
  UserX,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Ghost
} from 'lucide-react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { Link } from 'react-router-dom';
import HelpModal from '../components/HelpModal';
import ThemeToggle from '../components/ThemeToggle';
import ConfirmDialog from '../components/ConfirmDialog';
import { MONETAG_DIRECT_LINK, openMonetagLink, checkAdBlock } from '../lib/monetag';

interface Message {
  id: string;
  text: string;
  createdAt: any;
  recipientUid: string;
  senderUid?: string;
  senderName?: string;
  conversationId: string;
  emoji?: string;
  deviceInfo?: string;
  senderCity?: string;
  senderCountry?: string;
  mode?: 'normal' | 'roast' | 'flirt';
  reactions?: { [key: string]: number };
  expiresAt?: any;
}

interface Conversation {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: { [uid: string]: number };
  otherUser?: {
    uid: string;
    username: string;
    photoURL?: string;
    isVerified?: boolean;
    isGuest?: boolean;
  };
}

const EMOJIS = ['👀', '🔥', '❤️', '🤫', '✨', '👻'];

export default function Dashboard() {
  const { user, username, photoURL, role, refreshUser, setPhotoURL, customAppUrl, setCustomAppUrl, globalAppUrl, setGlobalAppUrl } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(messages.length === 0);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'friends'>('inbox');
  const [guessHint, setGuessHint] = useState<string | null>(null);
  const [blurMessage, setBlurMessage] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [lastViewedCount, setLastViewedCount] = useState(0);
  const [showPermissionWizard, setShowPermissionWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{username: string, photoURL?: string}[]>([]);
  const [searching, setSearching] = useState(false);
  const [revealingHint, setRevealingHint] = useState<string | null>(null);
  const [revealTimer, setRevealTimer] = useState(0);
  const [adBlockDetected, setAdBlockDetected] = useState(false);
  const [revealedHints, setRevealedHints] = useState<{ [key: string]: { city: string, country?: string, device: string } }>(() => {
    try {
      const saved = localStorage.getItem('sling_revealed_hints');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    // Check if onboarding is needed
    const onboardingDone = localStorage.getItem('sling_onboarding_done');
    if (!onboardingDone && user) {
      setShowPermissionWizard(true);
    }
  }, [user]);

  const requestGeolocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setWizardStep(prev => prev + 1);
        },
        () => {
          // Even if denied, move forward
          setWizardStep(prev => prev + 1);
        }
      );
    } else {
      setWizardStep(prev => prev + 1);
    }
  };

  const completeOnboarding = () => {
    localStorage.setItem('sling_onboarding_done', 'true');
    setShowPermissionWizard(false);
  };

  useEffect(() => {
    if (revealTimer > 0) {
      const timer = setTimeout(() => {
        if (revealTimer === 1 && revealingHint) {
          const msg = chatMessages.find(m => m.id === revealingHint) || messages.find(m => m.id === revealingHint);
          if (msg) {
            const newHints = {
              ...revealedHints,
              [msg.id]: {
                city: msg.senderCity || 'Unknown City',
                country: msg.senderCountry || 'Unknown Country',
                device: msg.deviceInfo || 'Unknown Device'
              }
            };
            setRevealedHints(newHints);
            localStorage.setItem('sling_revealed_hints', JSON.stringify(newHints));
          }
          setRevealingHint(null);
        }
        setRevealTimer(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [revealTimer, revealingHint, chatMessages, messages, revealedHints]);

  const handleRevealHint = async (msgId: string) => {
    setAdBlockDetected(false);
    const isBlocked = await checkAdBlock();
    if (isBlocked) {
      setAdBlockDetected(true);
      return;
    }
    setRevealingHint(msgId);
    setRevealTimer(15);
    openMonetagLink();
  };

  // DP Update state
  const [updatingDP, setUpdatingDP] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showUrlFixer, setShowUrlFixer] = useState(false);
  const [newAppUrl, setNewAppUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  const requestVerification = () => {
    const whatsappUrl = `https://wa.me/7306671336?text=${encodeURIComponent("I am interested in purchasing the official Sling Verification Badge for my account @" + username)}`;
    window.open(whatsappUrl, '_blank');
  };
  const [saveGlobally, setSaveGlobally] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Confirm Dialog state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
    type?: 'danger' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    cancelText: '',
    onConfirm: () => {}
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (notificationPermission === 'default') {
      requestNotificationPermission();
    }
  }, []);

  const getProfileUrl = () => {
    // Priority: 
    // 1. Global URL set by Admin (Source of truth for everyone)
    // 2. Custom URL set by user (if any)
    // 3. Environment variable
    // 4. Current origin
    const base = (globalAppUrl || customAppUrl || (process.env as any).APP_URL || window.location.origin).replace(/\/$/, '');
    
    // If the base already ends with the username, don't append it again
    if (base.toLowerCase().endsWith(`/${username?.toLowerCase()}`)) {
      return base;
    }
    return `${base}/${username}`;
  };

  const profileUrl = getProfileUrl();
  const isLocalhost = profileUrl.includes('localhost');

  const getShareMessage = (prompt: string) => {
    // Putting the link on its own line at the end is best for most platforms
    return `${prompt}\n\n${profileUrl}`;
  };

  const [showNotification, setShowNotification] = useState<Message | null>(null);
  const [lastMessageCount, setLastMessageCount] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const chatEndRef = useState<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    // We'll use a standard DOM find or just a manual offset if ref is tricky in this long file
    const element = document.getElementById('chat-end');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [chatMessages]);

  const handleSendMessage = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !activeConversation || !replyText.trim()) return;

    const text = replyText.trim();
    setReplyText('');
    setSendingReply(true);

    try {
      const otherUid = activeConversation.participants.find(p => p !== user.uid);
      if (!otherUid) return;

      await Promise.all([
        addDoc(collection(db, 'messages'), {
          conversationId: activeConversation.id,
          text,
          senderUid: user.uid,
          senderName: username || 'Anonymous',
          recipientUid: otherUid,
          createdAt: serverTimestamp()
        }),
        updateDoc(doc(db, 'conversations', activeConversation.id), {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          [`unreadCount.${otherUid}`]: (activeConversation.unreadCount?.[otherUid] || 0) + 1
        })
      ]);
    } catch (err) {
      console.error('Error sending message:', err);
      showToast('Failed to send message', 'error');
    } finally {
      setSendingReply(false);
    }
  };
  const [showHelp, setShowHelp] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestNotificationPermission = async () => {
    if (typeof Notification !== 'undefined') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  const playNotificationSound = () => {
    try {
      // Professional SMS/Message notification sound
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
      audio.volume = 0.8;
      audio.play().catch(e => console.warn('Audio auto-play blocked', e));
    } catch (e) {
      console.error('Audio play failed:', e);
    }
  };

  const showWebNotification = (title: string, body: string) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const options: any = {
        body,
        icon: photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sling',
        badge: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sling',
        tag: 'new-message',
        renotify: true,
        silent: false,
        vibrate: [200, 100, 200]
      };
      
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  };

  // In-memory cache for user info to prevent repeated Firestore calls
  const userCache = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // Process conversations in parallel
      const convsRaw = await Promise.all(snapshot.docs.map(async (d) => {
        const data = d.data();
        const otherUid = data.participants.find((p: string) => p !== user.uid);
        const isGuest = data.guestStatus?.[otherUid] === true;
        
        let otherUserInfo: any = { 
          username: isGuest ? 'Anonymous Guest' : 'Anonymous User',
          isGuest
        };
        
        if (otherUid && !isGuest && !otherUid.startsWith('anon_')) {
          // Check cache first
          if (userCache.current.has(otherUid)) {
            otherUserInfo = userCache.current.get(otherUid);
          } else {
            try {
              const userDoc = await getDoc(doc(db, 'users', otherUid));
              if (userDoc.exists()) {
                const uData = userDoc.data();
                otherUserInfo = {
                  uid: otherUid,
                  username: uData.username || 'Anonymous User',
                  photoURL: uData.photoURL,
                  isVerified: uData.isVerified || false,
                  isGuest: false
                };
                userCache.current.set(otherUid, otherUserInfo);
              }
            } catch (e) {
              console.warn('Error fetching other user info', e);
            }
          }
        } else if (otherUid) {
          otherUserInfo = {
            uid: otherUid,
            username: isGuest ? 'Anonymous Guest' : 'Anonymous User',
            isGuest
          };
        }

        return {
          id: d.id,
          ...data,
          otherUser: otherUserInfo
        } as Conversation;
      }));

      // Client-side sort to avoid index requirement
      const convs = convsRaw.sort((a, b) => {
        const timeA = (a as any).lastMessageAt?.toMillis?.() || (a as any).lastMessageAt || 0;
        const timeB = (b as any).lastMessageAt?.toMillis?.() || (b as any).lastMessageAt || 0;
        return timeB - timeA;
      });
      
      const totalUnread = convs.reduce((acc, c) => acc + (c.unreadCount?.[user.uid] || 0), 0);
      
      if (lastMessageCount !== null && totalUnread > lastMessageCount) {
        const latestUnreadConv = convs.find(c => (c.unreadCount?.[user.uid] || 0) > 0);
        if (latestUnreadConv) {
          playNotificationSound();
          showWebNotification(
            `Message from ${latestUnreadConv.otherUser?.username || 'Anonymous User'}`, 
            latestUnreadConv.lastMessage?.substring(0, 50) + (latestUnreadConv.lastMessage?.length > 50 ? '...' : '')
          );
        }
      }

      setLastMessageCount(totalUnread);
      setConversations(convs);
      setLoading(false);
    }, (err) => {
      console.error('Conversation subscription error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Subscribe to chat messages for active conversation
  useEffect(() => {
    if (!user || !activeConversation) {
      setChatMessages([]);
      return;
    }

    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', activeConversation.id),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      
      // Client-side sort to avoid composite index requirement
      msgs.sort((a, b) => {
        const timeA = (a as any).createdAt?.toMillis?.() || (a as any).createdAt || 0;
        const timeB = (b as any).createdAt?.toMillis?.() || (b as any).createdAt || 0;
        return timeA - timeB;
      });
      
      setChatMessages(msgs);
      
      // Mark as read
      if (activeConversation.unreadCount?.[user.uid] > 0) {
        updateDoc(doc(db, 'conversations', activeConversation.id), {
          [`unreadCount.${user.uid}`]: 0
        });
      }
    });

    return () => unsubscribe();
  }, [user, activeConversation]);

  // Search suggest cache
  const [initialSuggestionsFetched, setInitialSuggestionsFetched] = useState(false);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.length === 0) {
        if (initialSuggestionsFetched) return;
        // Fetch 50 users as suggestions
        setSearching(true);
        try {
          const q = query(
            collection(db, 'usernames'),
            limit(50)
          );
          const snapshot = await getDocs(q);
          const results = snapshot.docs.map((d) => {
            const data = d.data();
            return { 
              username: d.id,
              photoURL: data.photoURL || null
            };
          }).sort(() => Math.random() - 0.5); 
          
          setSearchResults(results.filter(r => r.username.toLowerCase() !== username?.toLowerCase()));
          setInitialSuggestionsFetched(true);
        } catch (err) {
          console.error('Search suggestions failed:', err);
        } finally {
          setSearching(false);
        }
        return;
      }

      if (searchQuery.length < 1) {
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
          limit(10)
        );
        const snapshot = await getDocs(q);
        
        const results = snapshot.docs.map((d) => {
          const data = d.data();
          return { 
            username: d.id,
            photoURL: data.photoURL || null
          };
        });
        
        setSearchResults(results.filter(r => r.username.toLowerCase() !== username?.toLowerCase()));
      } catch (err) {
        console.error('Search failed:', err);
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      showToast('Link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showToast('Failed to copy link', 'error');
    }
  };

  const SHARE_PROMPTS = [
    "Tell me what you really think... 🤫",
    "Send me a secret confession! ✨",
    "What's one thing you've never told me? 👀",
    "I'm ready for the truth. Send me a message! 🔥",
    "Tell me something I don't know... 👻"
  ];

  const shareProfile = async () => {
    const randomPrompt = SHARE_PROMPTS[Math.floor(Math.random() * SHARE_PROMPTS.length)];
    const fullMessage = `${randomPrompt}\n\n${profileUrl}`;
    
    // Try native share first on mobile - this is the best way for Insta/Snap
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try {
        await navigator.share({
          title: 'Sling',
          text: randomPrompt,
          url: profileUrl
        });
        return;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        } else {
          return;
        }
      }
    }

    // Show custom share menu for desktop or if native share fails/is cancelled
    setShowShareMenu(true);
  };

  const handlePlatformShare = async (platform: string, url?: string) => {
    const randomPrompt = SHARE_PROMPTS[Math.floor(Math.random() * SHARE_PROMPTS.length)];
    
    if (platform === 'Instagram' || platform === 'Snapchat') {
      // These apps don't have standard web share URLs
      // Try native share specifically for these if possible
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Sling',
            text: randomPrompt,
            url: profileUrl
          });
          setShowShareMenu(false);
          return;
        } catch (e) {
          // Fallback to copy
        }
      }
      const fullMsg = getShareMessage(randomPrompt);
      await navigator.clipboard.writeText(fullMsg);
      showToast(`Message copied! Open ${platform} to paste.`, 'success');
      setShowShareMenu(false);
      return;
    }

    if (url) {
      window.open(url, '_blank');
      setShowShareMenu(false);
    }
  };

  const saveCustomUrl = async () => {
    if (!user || !newAppUrl.trim()) return;
    setSavingUrl(true);
    try {
      let formattedUrl = newAppUrl.trim();
      if (!formattedUrl.startsWith('http')) {
        formattedUrl = `https://${formattedUrl}`;
      }
      // Remove trailing slash
      formattedUrl = formattedUrl.replace(/\/$/, '');
      
      // Validation: Ensure it's not pointing to a subpage
      if (formattedUrl.toLowerCase().endsWith('/dashboard') || 
          formattedUrl.toLowerCase().endsWith('/login') || 
          formattedUrl.toLowerCase().endsWith('/signup')) {
        showToast('Please use the base URL of your app (e.g., https://your-app.run.app)', 'error');
        setSavingUrl(false);
        return;
      }
      
      if (saveGlobally && role === 'admin') {
        await setDoc(doc(db, 'settings', 'config'), {
          publicUrl: formattedUrl,
          updatedBy: user.uid,
          updatedAt: serverTimestamp()
        }, { merge: true });
        setGlobalAppUrl(formattedUrl);
        showToast('Global link updated for all users! 🌍', 'success');
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          customAppUrl: formattedUrl
        });
        setCustomAppUrl(formattedUrl);
        showToast('Public link updated! 🚀', 'success');
      }
      setShowUrlFixer(false);
    } catch (err) {
      console.error('Error saving URL:', err);
      showToast('Failed to save link', 'error');
    } finally {
      setSavingUrl(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !username) return;
    setDeletingAccount(true);
    try {
      // 1. Delete all messages received by the user
      const messagesRef = collection(db, 'messages');
      const q = query(messagesRef, where('recipientUid', '==', user.uid));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'messages', d.id)));
      
      // 2. Delete username mapping
      const usernamePromise = deleteDoc(doc(db, 'usernames', username.toLowerCase()));
      
      // 3. Delete user profile
      const userPromise = deleteDoc(doc(db, 'users', user.uid));
      
      await Promise.all([...deletePromises, usernamePromise, userPromise]);
      
      // 4. Sign out and clear local storage
      await auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    } catch (err) {
      console.error('Error deleting account:', err);
      showToast('Failed to delete account. Please try again.', 'error');
      setDeletingAccount(false);
    }
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
      const storageRef = ref(storage, `profiles/${user.uid}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        }
      );

      await uploadTask;
      const url = await getDownloadURL(storageRef);
      
      // Optimistic UI update
      setPhotoURL(url);
      localStorage.setItem('sling_photo', url);
      showToast('Profile picture updated!', 'success');

      await Promise.all([
        setDoc(doc(db, 'users', user.uid), {
          photoURL: url
        }, { merge: true }),
        setDoc(doc(db, 'usernames', username.toLowerCase()), {
          photoURL: url
        }, { merge: true })
      ]);
      
      refreshUser();
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

  const reportMessage = async (msg: Message) => {
    if (!user) return;
    
    setConfirmConfig({
      isOpen: true,
      title: 'Report Message',
      message: t('report_confirm'),
      confirmText: 'Report',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          await addDoc(collection(db, 'reports'), {
            messageId: msg.id,
            messageText: msg.text,
            reportedBy: user.uid,
            recipientUid: msg.recipientUid,
            senderUid: msg.senderUid || 'anonymous',
            createdAt: serverTimestamp(),
            status: 'pending'
          });
          showToast(t('report_success'), 'success');
        } catch (err) {
          console.error('Report Error:', err);
          showToast('Failed to report message', 'error');
        }
      }
    });
  };

  const blockUser = async (msg: Message) => {
    if (!user || !msg.senderUid) {
      showToast('Cannot block anonymous users without a UID', 'error');
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: 'Block User',
      message: t('block_confirm'),
      confirmText: 'Block',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          const blockId = `${user.uid}_${msg.senderUid}`;
          await setDoc(doc(db, 'blocks', blockId), {
            blockerUid: user.uid,
            blockedUid: msg.senderUid,
            createdAt: serverTimestamp()
          });
          showToast(t('block_success'), 'success');
        } catch (err) {
          console.error('Block Error:', err);
          showToast('Failed to block user', 'error');
        }
      }
    });
  };

  const updateAvatarStyle = async (style: 'boy' | 'girl' | 'neutral') => {
    if (!user || !username) return;
    setUpdatingDP(true);
    
    let avatarStyle = 'avataaars';
    if (style === 'boy') avatarStyle = 'micah';
    if (style === 'girl') avatarStyle = 'lorelei';
    
    const newPhotoURL = `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${username.toLowerCase()}`;
    
    // Optimistic UI update
    setPhotoURL(newPhotoURL);
    localStorage.setItem('sling_photo', newPhotoURL);
    setShowAvatarPicker(false);
    showToast('Avatar style updated!', 'success');

    try {
      await Promise.all([
        setDoc(doc(db, 'users', user.uid), {
          photoURL: newPhotoURL,
          avatarType: style
        }, { merge: true }),
        setDoc(doc(db, 'usernames', username.toLowerCase()), {
          photoURL: newPhotoURL
        }, { merge: true })
      ]);
      
      // Background refresh to ensure consistency
      refreshUser();
    } catch (err: any) {
      console.error('Avatar Update Error:', err);
      showToast('Failed to sync avatar with server', 'error');
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
    <div className="min-h-screen bg-theme pb-20">
      {/* SMS-style Notification Banner */}
      <AnimatePresence>
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -100, scale: 0.95 }}
            onClick={() => {
              setActiveTab('inbox');
              setShowNotification(null);
            }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[92%] max-w-md cursor-pointer"
          >
            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-white/20 dark:border-white/10 p-4 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 gradient-bg rounded-2xl flex items-center justify-center shadow-lg">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white dark:border-gray-900 rounded-full" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h4 className="font-black text-sm tracking-tight text-gray-900 dark:text-white uppercase">Sling Message</h4>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Now</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1 font-medium">
                  {showNotification.text}
                </p>
              </div>
              <div className="w-8 h-8 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>
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
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="logo-text text-xl text-theme">Sling</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <div className="relative">
            <button 
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2.5 text-gray-400 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all flex items-center gap-2 group"
              title={t('language')}
            >
              <Globe className="w-4 h-4 group-hover:text-purple-400 transition-colors" />
              <span className="text-sm font-medium">{languages.find(l => l.code === language)?.flag}</span>
            </button>
            
            <AnimatePresence>
              {showLangMenu && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowLangMenu(false)}
                    className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm md:hidden"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-56 bg-[#121212] border border-white/10 rounded-2xl p-2 z-[100] shadow-2xl backdrop-blur-2xl max-h-[70vh] overflow-y-auto no-scrollbar"
                  >
                    <div className="px-3 py-2 mb-1 border-b border-white/5">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('language')}</p>
                    </div>
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setLanguage(lang.code as any);
                          setShowLangMenu(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all group",
                          language === lang.code 
                            ? "bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/20" 
                            : "text-gray-300 hover:bg-white/5"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{lang.flag}</span>
                          <span>{lang.name}</span>
                        </div>
                        {language === lang.code && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={requestNotificationPermission}
            className={cn(
              "p-2 rounded-xl transition-all",
              notificationPermission === 'granted' ? "text-green-400 bg-green-400/10" : "text-gray-400 bg-white/5 hover:bg-white/10"
            )}
            title={notificationPermission === 'granted' ? "Notifications Enabled" : "Enable Notifications"}
          >
            {notificationPermission === 'granted' ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </button>
          <ThemeToggle iconOnly />
          <button 
            onClick={() => setShowHelp(true)}
            className="p-2 text-purple-400 hover:text-purple-300 transition-colors"
            title="How to use & Features"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          {role === 'admin' && (
            <Link to="/admin-secure-panel" className="p-2 text-purple-400 hover:text-purple-300 transition-colors">
              <Shield className="w-5 h-5" />
            </Link>
          )}
          <button onClick={logout} className="p-2 text-gray-400 hover:text-theme transition-colors" title="Logout">
            <LogOut className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowDeleteAccount(true)} 
            className="p-2 text-gray-600 hover:text-red-400 transition-colors"
            title="Delete Account"
          >
            <UserX className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 pt-8">
        {/* Tabs */}
        <div className="flex bg-theme p-1 rounded-2xl mb-8 relative border border-white/5">
          <button 
            onClick={() => {
              setActiveTab('inbox');
              setShowNotification(null);
            }}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all relative",
              activeTab === 'inbox' ? "bg-white/10 text-theme shadow-lg" : "text-gray-500 hover:text-gray-300"
            )}
          >
            <MessageCircle className="w-4 h-4" />
            Inbox
            {showNotification && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-theme animate-bounce">
                !
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('friends')}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
              activeTab === 'friends' ? "bg-white/10 text-theme shadow-lg" : "text-gray-500 hover:text-gray-300"
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
                            className="absolute inset-0 overlay flex flex-col items-center justify-center p-2 gap-2"
                          >
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => updateAvatarStyle('boy')} className="w-full py-1 bg-white/10 rounded-lg text-[10px] font-bold hover:bg-white/20">👦 Boy</motion.button>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => updateAvatarStyle('girl')} className="w-full py-1 bg-white/10 rounded-lg text-[10px] font-bold hover:bg-white/20">👧 Girl</motion.button>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => updateAvatarStyle('neutral')} className="w-full py-1 bg-white/10 rounded-lg text-[10px] font-bold hover:bg-white/20">👤 Neutral</motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {updatingDP && (
                        <div className="absolute inset-0 overlay flex flex-col items-center justify-center">
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
                  <h2 className="text-2xl font-bold mb-1 text-theme">@{username}</h2>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">{t('share_to_start')}</p>

                  {role === 'admin' && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full mb-6 p-6 bg-purple-500/10 border border-purple-500/20 rounded-[2rem] text-center shadow-xl shadow-purple-500/5"
                    >
                      <div className="flex items-center justify-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                          <Shield className="w-5 h-5 text-purple-400" />
                        </div>
                        <h3 className="text-sm font-bold text-theme uppercase tracking-widest">Admin Dashboard</h3>
                      </div>
                      <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
                        You have full control. Manage users, messages, or set the <span className="text-purple-400 font-bold">Global App Link</span> for everyone.
                      </p>
                      <div className="flex gap-2">
                        <Link 
                          to="/admin-secure-panel"
                          className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-purple-700 transition-all shadow-lg shadow-purple-600/20"
                        >
                          Control Panel
                        </Link>
                        <button 
                          onClick={() => {
                            setNewAppUrl(globalAppUrl || customAppUrl || '');
                            setSaveGlobally(true);
                            setShowUrlFixer(true);
                          }}
                          className="flex-1 bg-white/5 border border-white/10 text-theme py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                        >
                          Global Link
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Only Admin sees the Link Issue warning to fix it globally */}
                  {isLocalhost && role === 'admin' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center"
                    >
                      <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
                        <AlertTriangle className="w-3 h-3" />
                        Global Link Required
                      </p>
                      <p className="text-[10px] text-gray-400 mb-3">
                        The current link contains "localhost". Set a global link for all users.
                      </p>
                      <button 
                        onClick={() => {
                          setNewAppUrl(globalAppUrl || '');
                          setSaveGlobally(true);
                          setShowUrlFixer(true);
                        }}
                        className="text-[10px] bg-amber-500 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest hover:bg-amber-600 transition-colors"
                      >
                        Set Global Link
                      </button>
                    </motion.div>
                  )}

                  <div className="w-full space-y-4">
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={copyLink}
                        className="w-full gradient-bg text-white py-5 rounded-[2rem] flex items-center justify-center gap-4 transition-all active:scale-[0.98] shadow-2xl shadow-purple-500/20 group"
                      >
                        <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center group-hover:rotate-12 transition-transform">
                          {copied ? <Check className="w-5 h-5 text-white" /> : <Copy className="w-5 h-5 text-white" />}
                        </div>
                        <span className="font-black text-lg uppercase tracking-tight">{copied ? t('copied') : 'Copy My Sling Link'}</span>
                      </button>

                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => {
                            const randomPrompt = SHARE_PROMPTS[Math.floor(Math.random() * SHARE_PROMPTS.length)];
                            const text = `${randomPrompt}\n\n${profileUrl}`;
                            navigator.clipboard.writeText(text);
                            showToast('Catchy link copied! 🔥', 'success');
                          }}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                          <Sparkles className="w-4 h-4 text-yellow-400" />
                          <span className="text-xs font-bold uppercase tracking-widest">Catchy Link</span>
                        </button>
                        
                        <button 
                          onClick={() => showToast('Sling Polls coming soon! 🗳️', 'success')}
                          className="bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                          <Zap className="w-4 h-4 text-purple-400" />
                          <span className="text-xs font-bold uppercase tracking-widest">Sling Polls</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-theme rounded-2xl border border-white/5 text-center">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-1">Your Public Address</p>
                      <p className="text-xs font-mono text-purple-400 break-all">{profileUrl}</p>
                    </div>

                    <div className="glass p-5 rounded-[2rem] border-white/10 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400">
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-widest text-theme">{t('account_status')}</h4>
                          <p className="text-[9px] text-gray-500">{t('manage_verification')}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        <button 
                          onClick={requestVerification}
                          className="w-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 py-4 rounded-xl flex items-center justify-between px-5 transition-all active:scale-95 group"
                        >
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-4 h-4 text-blue-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Get Official Verification</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-blue-400/50 group-hover:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Catchy Feature: Sling Streaks */}
              <div className="mb-8 overflow-hidden">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-theme flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    Sling Streaks
                  </h3>
                  <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-2 py-1 rounded-lg">LIVE</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-2">
                  {[
                    { name: 'Your Streak', icon: '🔥', count: '0', color: 'bg-orange-500' },
                    { name: 'Top Fan', icon: '👑', count: 'None', color: 'bg-yellow-500' },
                    { name: 'Total Slings', icon: '🚀', count: messages.length, color: 'bg-purple-500' },
                    { name: 'Global Rank', icon: '🌍', count: '#99+', color: 'bg-blue-500' }
                  ].map((item, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex-shrink-0 w-32 glass p-4 rounded-3xl border border-white/5 relative overflow-hidden group"
                    >
                      <div className={`absolute -top-4 -right-4 w-12 h-12 ${item.color} opacity-10 blur-xl group-hover:opacity-20 transition-opacity`} />
                      <div className="text-2xl mb-2">{item.icon}</div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter mb-1">{item.name}</div>
                      <div className="text-lg font-black text-theme">{item.count}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Conversations Section */}
              <div className="flex items-center justify-between mb-6 px-2">
                <h3 className="text-xl font-bold flex items-center gap-2 text-theme">
                  <MessageCircle className="w-5 h-5 text-purple-400" />
                  {t('inbox')}
                  <span className="bg-purple-500/10 dark:bg-white/10 px-2 py-0.5 rounded-full text-xs font-medium text-purple-600 dark:text-gray-400">
                    {conversations.length}
                  </span>
                </h3>
              </div>

              {loading && conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-12 h-12 border-4 border-white/10 border-t-purple-500 rounded-full animate-spin" />
                  <p className="text-gray-500 text-sm animate-pulse">Checking for conversations...</p>
                </div>
              ) : conversations.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass p-12 rounded-[2rem] text-center flex flex-col items-center"
                >
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Info className="w-8 h-8 text-gray-400" />
                  </div>
                  <h4 className="text-lg font-bold mb-2 text-theme">No conversations yet</h4>
                  <p className="text-gray-500 dark:text-gray-400 text-sm max-w-[200px]">
                    Share your profile link to start receiving anonymous messages!
                  </p>
                </motion.div>
              ) : (
                <div className="grid gap-3">
                  <AnimatePresence mode="popLayout">
                    {conversations.map((conv, index) => (
                      <motion.button
                        key={conv.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => setActiveConversation(conv)}
                        className="glass p-5 rounded-3xl flex items-center gap-4 text-left hover:bg-white/5 transition-all group relative border border-white/5"
                      >
                        <div className="relative">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/10 flex items-center justify-center overflow-hidden">
                            {conv.otherUser?.photoURL ? (
                              <img src={conv.otherUser.photoURL} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon className="w-6 h-6 text-gray-500" />
                            )}
                          </div>
                          {conv.unreadCount?.[user?.uid || ''] > 0 && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-gray-900 animate-pulse">
                              {conv.unreadCount[user?.uid || '']}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={cn(
                              "font-bold text-theme truncate",
                              conv.otherUser?.isGuest && "text-purple-400"
                            )}>
                              {conv.otherUser?.username || 'Anonymous User'}
                            </span>
                            {conv.otherUser?.isVerified && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="currentColor" />
                            )}
                            {conv.otherUser?.isGuest && (
                              <Ghost className="w-3 h-3 text-purple-400/50" />
                            )}
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-1 group-hover:text-gray-400 transition-colors">
                            {conv.lastMessage || 'Sent an anonymous message'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] font-bold text-gray-600 uppercase">
                            {formatMessageDate(conv.lastMessageAt)}
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-purple-400 transition-colors" />
                        </div>
                      </motion.button>
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
                    placeholder={t('search_users')}
                    maxLength={20}
                    className="w-full input-theme rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-400"                  />
                </div>

                <div className="space-y-4">
                  {searching ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-purple-500"></div>
                    </div>
                  ) : searchQuery.length > 0 && searchResults.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      {t('no_results')} "{searchQuery}"
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
                          to={`/${res.username.toLowerCase()}`}
                          className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
                        >
                          {t('send')}
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </motion.div>
                    ))
                  )}
                  
                  {searchQuery.length === 0 && searchResults.length === 0 && (
                    <div className="text-center py-12 flex flex-col items-center">
                      <Users className="w-12 h-12 text-gray-500 mb-4" />
                      <p className="text-gray-500 text-sm max-w-[200px]">
                        {t('share_to_start')}
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
          onClick={copyLink}
          className="gradient-bg text-white px-8 py-4 rounded-full font-black shadow-2xl shadow-purple-500/40 flex items-center gap-3 active:scale-95 transition-all uppercase tracking-tight text-sm"
        >
          {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          {copied ? t('copied') : 'Copy My Link'}
        </button>
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {selectedMessage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 overlay"
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
                      {window.location.origin.replace(/^https?:\/\//, '')}/{username}
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

      <HelpModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
        onTestNotification={() => {
          const testMsg: Message = {
            id: 'test',
            text: 'This is a test Sling message! It looks just like an SMS. 🤫',
            createdAt: new Date(),
            recipientUid: user?.uid || '',
            senderName: 'Sling Bot',
            conversationId: 'test-conv'
          };
          setShowNotification(testMsg);
          playNotificationSound();
          showWebNotification('Sling: Test Message! 🤫', testMsg.text);
          setShowHelp(false);
        }}
      />

      <ConfirmDialog
        {...confirmConfig}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Reveal Overlay */}
      {revealingHint && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
        >
          <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500 mb-6 shadow-[0_0_50px_rgba(245,158,11,0.2)] border border-amber-500/50">
            <Sparkles className="w-10 h-10 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Revealing Sender Hint...</h3>
          <p className="text-gray-400 text-sm max-w-xs mb-8">
            Stay on this screen for 10 seconds to reveal the location and device of this sender!
          </p>
          
          <div className="relative w-16 h-16 flex items-center justify-center mb-8">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="30"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                className="text-white/10"
              />
              <motion.circle
                cx="32"
                cy="32"
                r="30"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={188.4}
                animate={{ strokeDashoffset: 188.4 - (revealTimer / 10) * 188.4 }}
                className="text-amber-500"
              />
            </svg>
            <span className="absolute text-xl font-mono font-bold text-amber-500">{revealTimer}s</span>
          </div>

          <button 
            onClick={() => {
              setRevealingHint(null);
              setRevealTimer(0);
            }}
            className="text-gray-500 hover:text-white transition-colors text-sm font-bold border border-white/10 px-6 py-2 rounded-full"
          >
            Cancel
          </button>
        </motion.div>
      )}

      {/* Custom Share Menu Modal */}
      <AnimatePresence>
        {showShareMenu && (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareMenu(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-gray-900 border-t sm:border border-white/10 rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold text-white">Share Profile</h3>
                  <button 
                    onClick={() => setShowShareMenu(false)}
                    className="p-2 text-gray-500 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-6 mb-8">
                  {[
                    { 
                      name: 'WhatsApp', 
                      icon: <MessageCircle className="w-6 h-6" />, 
                      color: 'bg-green-500',
                      url: `https://wa.me/?text=${encodeURIComponent(profileUrl + '\n\n' + SHARE_PROMPTS[0])}`
                    },
                    { 
                      name: 'Facebook', 
                      icon: <Facebook className="w-6 h-6" />, 
                      color: 'bg-blue-600',
                      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`
                    },
                    { 
                      name: 'X (Twitter)', 
                      icon: <Twitter className="w-6 h-6" />, 
                      color: 'bg-black',
                      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_PROMPTS[0])}&url=${encodeURIComponent(profileUrl)}`
                    },
                    { 
                      name: 'Telegram', 
                      icon: <Send className="w-6 h-6" />, 
                      color: 'bg-sky-500',
                      url: `https://t.me/share/url?url=${encodeURIComponent(profileUrl)}&text=${encodeURIComponent(SHARE_PROMPTS[0])}`
                    },
                    { 
                      name: 'LinkedIn', 
                      icon: <Linkedin className="w-6 h-6" />, 
                      color: 'bg-blue-700',
                      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(profileUrl)}`
                    },
                    { 
                      name: 'Instagram', 
                      icon: <Instagram className="w-6 h-6" />, 
                      color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600',
                      platform: 'Instagram'
                    },
                    { 
                      name: 'Snapchat', 
                      icon: <Zap className="w-6 h-6" />, 
                      color: 'bg-yellow-400 text-black',
                      platform: 'Snapchat'
                    },
                    { 
                      name: 'Copy', 
                      icon: <Copy className="w-6 h-6" />, 
                      color: 'bg-gray-700',
                      action: copyLink
                    }
                  ].map((platform) => (
                    <button
                      key={platform.name}
                      onClick={() => {
                        if (platform.platform) {
                          handlePlatformShare(platform.platform);
                        } else if (platform.url) {
                          handlePlatformShare(platform.name, platform.url);
                        } else if (platform.action) {
                          platform.action();
                          setShowShareMenu(false);
                        }
                      }}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-all group-hover:scale-110 group-active:scale-95",
                        platform.color
                      )}>
                        {platform.icon}
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{platform.name}</span>
                    </button>
                  ))}
                </div>

                <div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between border border-white/5">
                  <div className="truncate mr-4">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Your Profile Link</p>
                    <p className="text-sm text-white truncate font-mono">{profileUrl}</p>
                  </div>
                  <button 
                    onClick={copyLink}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* URL Fixer Modal */}
      <AnimatePresence>
        {showUrlFixer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUrlFixer(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md glass p-8 rounded-[2.5rem] relative z-10"
            >
              <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Globe className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-xl font-bold text-center text-theme mb-2">Set Public Link</h3>
              <p className="text-sm text-gray-400 text-center mb-8">
                Paste your app's public URL below so your share links work correctly.
              </p>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                    Public App URL
                  </label>
                  <input 
                    type="text"
                    value={newAppUrl}
                    onChange={(e) => setNewAppUrl(e.target.value)}
                    placeholder="https://your-app.run.app"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-theme focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                  <p className="text-[9px] text-gray-600 italic px-1">
                    Example: https://ais-dev-arj.run.app
                  </p>
                </div>

                {role === 'admin' && (
                  <div className="flex items-center gap-3 p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl">
                    <input 
                      type="checkbox"
                      id="saveGlobally"
                      checked={saveGlobally}
                      onChange={(e) => setSaveGlobally(e.target.checked)}
                      className="w-5 h-5 rounded border-white/10 bg-white/5 text-purple-500 focus:ring-purple-500"
                    />
                    <label htmlFor="saveGlobally" className="text-xs text-gray-400 cursor-pointer">
                      Apply this link to <span className="text-purple-400 font-bold">ALL users</span> globally
                    </label>
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowUrlFixer(false)}
                    className="flex-1 py-4 rounded-xl font-bold text-gray-500 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveCustomUrl}
                    disabled={savingUrl || !newAppUrl.trim()}
                    className="flex-2 gradient-bg py-4 rounded-xl font-bold text-white shadow-xl shadow-purple-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingUrl ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save Link
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Account Modal */}
      <AnimatePresence>
        {showDeleteAccount && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 overlay"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md glass p-8 rounded-[2.5rem] relative z-10"
            >
              <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <UserX className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-center text-theme mb-2">Delete Account?</h3>
              <p className="text-sm text-gray-400 text-center mb-8">
                This will permanently delete your profile, username, and all received messages. This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteAccount(false)}
                  className="flex-1 py-4 rounded-xl font-bold text-gray-500 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="flex-2 bg-red-500 py-4 rounded-xl font-bold text-white shadow-xl shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingAccount ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Everything
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Permission Wizard */}
      <AnimatePresence>
        {showPermissionWizard && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm glass p-8 rounded-[2.5rem] relative"
            >
              <div className="absolute top-0 right-0 p-4">
                <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">
                  Step {wizardStep} / 3
                </div>
              </div>

              {wizardStep === 1 && (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 mb-6">
                    <Bell className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Enable Notifications</h3>
                  <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                    Get instant SMS-style alerts when someone sends you a message. You won't miss a single Sling!
                  </p>
                  <button 
                    onClick={async () => {
                      await requestNotificationPermission();
                      setWizardStep(2);
                    }}
                    className="w-full gradient-bg text-white py-4 rounded-xl font-bold shadow-lg shadow-purple-500/20 active:scale-95 transition-all"
                  >
                    Allow Notifications
                  </button>
                  <button 
                    onClick={() => setWizardStep(2)}
                    className="mt-4 text-[10px] text-gray-500 font-bold uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Later
                  </button>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mb-6">
                    <MapPin className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Location Access</h3>
                  <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                    We use your location to provide "Hints" to others. It makes the game much more exciting!
                  </p>
                  <button 
                    onClick={requestGeolocation}
                    className="w-full gradient-bg text-white py-4 rounded-xl font-bold shadow-lg shadow-purple-500/20 active:scale-95 transition-all"
                  >
                    Enable Location
                  </button>
                  <button 
                    onClick={() => setWizardStep(3)}
                    className="mt-4 text-[10px] text-gray-500 font-bold uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Later
                  </button>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 mb-6">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Storage & Photos</h3>
                  <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                    To upload profile pictures and share stories, we need access to your photos.
                  </p>
                  <button 
                    onClick={completeOnboarding}
                    className="w-full gradient-bg text-white py-4 rounded-xl font-bold shadow-lg shadow-purple-500/20 active:scale-95 transition-all"
                  >
                    Allow Photo Access
                  </button>
                  <button 
                    onClick={completeOnboarding}
                    className="mt-4 text-[10px] text-gray-500 font-bold uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Finish Setup
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {adBlockDetected && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
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
      </AnimatePresence>
      <AnimatePresence>
        {activeConversation && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[150] bg-[#0a0a0a] flex flex-col"
          >
            {/* Chat Header */}
            <div className="glass px-4 py-3 flex items-center gap-3 shrink-0 border-b border-white/5">
              <button 
                onClick={() => setActiveConversation(null)}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-theme" />
              </button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/10 flex items-center justify-center overflow-hidden">
                {activeConversation.otherUser?.photoURL ? (
                  <img src={activeConversation.otherUser.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-theme truncate">{activeConversation.otherUser?.username || 'Anonymous User'}</h3>
                  {activeConversation.otherUser?.isVerified && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" fill="currentColor" />
                  )}
                </div>
                <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Active Now</p>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => showToast('Secure Thread Active', 'success')}
                  className="p-2 text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <Shield className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4 no-scrollbar">
              {chatMessages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <MessageCircle className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-bold text-theme">No messages yet.</p>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Start the conversation!</p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => {
                  const isMe = msg.senderUid === user?.uid;
                  const showDate = idx === 0 || formatMessageDate(msg.createdAt) !== formatMessageDate(chatMessages[idx-1]?.createdAt);
                  
                  return (
                    <div key={msg.id} className="flex flex-col">
                      {showDate && (
                        <div className="flex justify-center my-4">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-600 bg-white/5 px-3 py-1 rounded-full">
                            {formatMessageDate(msg.createdAt)}
                          </span>
                        </div>
                      )}
                      <div className={cn(
                        "flex flex-col max-w-[85%] group",
                        isMe ? "self-end items-end" : "self-start items-start"
                      )}>
                        <motion.div 
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={cn(
                            "px-4 py-3 rounded-2xl text-sm font-medium shadow-sm transition-all",
                            isMe 
                              ? "bg-purple-600 text-white rounded-tr-none" 
                              : "bg-[#1a1a1a] text-theme rounded-tl-none border border-white/5"
                          )}
                        >
                          {msg.text}
                        </motion.div>
                        <div className="flex items-center gap-2 mt-1 px-1">
                          <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">
                            {typeof msg.createdAt?.toDate === 'function' ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                          </span>
                          {!isMe && (
                            <button 
                              onClick={() => handleRevealHint(msg.id)}
                              className={cn(
                                "text-[8px] font-black uppercase tracking-[0.2em] transition-colors",
                                revealedHints[msg.id] ? "text-green-500" : "text-amber-500 hover:text-amber-400"
                              )}
                            >
                              {revealedHints[msg.id] ? 'Hint Revealed' : 'Reveal Hint'}
                            </button>
                          )}
                        </div>
                        
                        {revealedHints[msg.id] && !isMe && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col gap-1 w-full"
                          >
                             <div className="flex items-center gap-2">
                               <MapPin className="w-3 h-3 text-amber-500" />
                               <span className="text-[9px] font-bold text-amber-500 uppercase">{revealedHints[msg.id].city}, {revealedHints[msg.id].country}</span>
                             </div>
                             <div className="flex items-center gap-2">
                               <Globe className="w-3 h-3 text-amber-500" />
                               <span className="text-[9px] font-bold text-amber-500 uppercase">{revealedHints[msg.id].device}</span>
                             </div>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div id="chat-end" />
            </div>

            {/* Chat Input */}
            <form 
              onSubmit={handleSendMessage} 
              className="p-4 glass shrink-0 flex items-center gap-2 border-t border-white/5"
            >
              <div className="flex-1 relative flex items-center">
                <input 
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type a professional response..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-purple-500/50 transition-all text-theme pr-12"
                />
                <button 
                   type="button"
                   onClick={() => showToast('Premium Emojis Locked. Watch ad to unlock.', 'error')}
                   className="absolute right-3 p-1 text-gray-500 hover:text-purple-400 transition-colors"
                >
                  <Smile className="w-5 h-5" />
                </button>
              </div>
              <button 
                type="submit"
                disabled={!replyText.trim() || sendingReply}
                className="p-3.5 bg-purple-600 text-white rounded-2xl disabled:opacity-50 disabled:grayscale transition-all active:scale-95 shadow-lg shadow-purple-600/20"
              >
                {sendingReply ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5 rotate-[-45deg] translate-x-0.5" />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
