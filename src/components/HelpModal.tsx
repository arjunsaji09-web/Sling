import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle, Sparkles, Shield, Zap, MessageCircle, Database, CheckCircle, Bell, Info, Instagram } from 'lucide-react';
import { useLanguage } from '../App';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTestNotification?: () => void;
}

export default function HelpModal({ isOpen, onClose, onTestNotification }: HelpModalProps) {
  const { t } = useLanguage();
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 overlay"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-theme border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <div className="p-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl logo-text text-theme">{t('how_to_use')}</h2>
                    <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">{t('key_features')} & Guide</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-8">
                {/* Features */}
                <section>
                  <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    {t('key_features')}
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
                      <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <MessageCircle className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h4 className="text-theme font-bold text-sm mb-1">{t('anonymous_messages')}</h4>
                        <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{t('share_to_start')}</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
                      <div className="w-10 h-10 bg-pink-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-pink-400" />
                      </div>
                      <div>
                        <h4 className="text-theme font-bold text-sm mb-1">{t('interactive_modes')}</h4>
                        <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{t('interactive_modes')}</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
                      <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-green-400" />
                      </div>
                      <div>
                        <h4 className="text-theme font-bold text-sm mb-1">{t('real_time_chat')}</h4>
                        <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{t('real_time_chat')}</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* How to use */}
                <section>
                  <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    {t('getting_started')}
                  </h3>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-[10px] font-bold text-purple-400 shrink-0">1</div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{t('step_1')}</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-[10px] font-bold text-purple-400 shrink-0">2</div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{t('step_2')}</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-[10px] font-bold text-purple-400 shrink-0">3</div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{t('step_3')}</p>
                    </div>
                  </div>
                </section>

                {/* Data & Storage */}
                <section className="p-6 bg-purple-500/5 rounded-3xl border border-purple-500/10">
                  <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Data & Storage
                  </h3>
                  <p className="text-gray-400 text-xs leading-relaxed mb-4">
                    Sling uses minimal storage to provide a fast and secure experience:
                  </p>
                  <ul className="space-y-2 mb-6">
                    <li className="flex items-center gap-2 text-[10px] text-gray-500">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>Local Caching for instant message loading</span>
                    </li>
                    <li className="flex items-center gap-2 text-[10px] text-gray-500">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>Secure Firestore storage for your profile</span>
                    </li>
                    <li className="flex items-center gap-2 text-[10px] text-gray-500">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>Encrypted authentication via Firebase</span>
                    </li>
                    <li className="flex items-center gap-2 text-[10px] text-gray-500">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>Report & Block system for safety</span>
                    </li>
                    <li className="flex items-center gap-2 text-[10px] text-gray-500">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>100 message daily limit per user</span>
                    </li>
                  </ul>
                  <button 
                    onClick={onTestNotification}
                    className="w-full py-3 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <Bell className="w-4 h-4" />
                    Test SMS Notification
                  </button>
                  <div className="flex items-center justify-between p-3 bg-theme rounded-xl border border-white/5 mt-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-purple-400" />
                      <span className="text-[10px] font-bold text-theme uppercase tracking-wider">Storage Permission</span>
                    </div>
                    <div className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Granted</div>
                  </div>
                  <p className="mt-3 text-[9px] text-gray-600 text-center italic">
                    By using Sling, you agree to our use of local storage for session management.
                  </p>
                  
                  <div className="mt-4 p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-white/5 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                        <Instagram className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-white uppercase tracking-wider">Follow us</p>
                        <p className="text-xs text-gray-400">@_sling_ on Instagram</p>
                      </div>
                    </div>
                    <a 
                      href="https://instagram.com/_sling_" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-bold text-white transition-all"
                    >
                      Follow
                    </a>
                  </div>
                </section>
              </div>
            </div>
            
            <div className="p-6 bg-white/5 border-t border-white/5 flex justify-center">
              <button 
                onClick={onClose}
                className="gradient-bg px-8 py-3 rounded-xl font-bold text-white text-sm shadow-xl shadow-purple-500/20 hover:scale-105 transition-transform"
              >
                Got it, let's go!
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
