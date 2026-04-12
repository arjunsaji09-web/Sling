import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle, Sparkles, Shield, Zap, MessageCircle, Database, CheckCircle } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
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
                  <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
                    <HelpCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-theme tracking-tight">How to use Sling</h2>
                    <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">Features & Guide</p>
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
                    Key Features
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
                      <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <MessageCircle className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h4 className="text-theme font-bold text-sm mb-1">Anonymous Messages</h4>
                        <p className="text-gray-500 text-xs leading-relaxed">Receive honest feedback, roasts, or flirtatious messages from friends without knowing who sent them.</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
                      <div className="w-10 h-10 bg-pink-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-pink-400" />
                      </div>
                      <div>
                        <h4 className="text-theme font-bold text-sm mb-1">Interactive Modes</h4>
                        <p className="text-gray-500 text-xs leading-relaxed">Switch between Normal, Roast, and Flirt modes to set the vibe for your profile.</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
                      <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-green-400" />
                      </div>
                      <div>
                        <h4 className="text-theme font-bold text-sm mb-1">Real-time Chat</h4>
                        <p className="text-gray-500 text-xs leading-relaxed">Reply to anonymous messages and start a conversation while keeping the sender's identity hidden.</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* How to use */}
                <section>
                  <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Getting Started
                  </h3>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-[10px] font-bold text-purple-400 shrink-0">1</div>
                      <p className="text-gray-400 text-xs leading-relaxed">Create your account and choose a unique username and avatar.</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-[10px] font-bold text-purple-400 shrink-0">2</div>
                      <p className="text-gray-400 text-xs leading-relaxed">Copy your profile link and share it on your Instagram bio, WhatsApp, or Snapchat.</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-[10px] font-bold text-purple-400 shrink-0">3</div>
                      <p className="text-gray-400 text-xs leading-relaxed">Wait for the messages to roll in! You'll get notified instantly when someone sends a Sling.</p>
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
                  </ul>
                  <div className="flex items-center justify-between p-3 bg-theme rounded-xl border border-white/5">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-purple-400" />
                      <span className="text-[10px] font-bold text-theme uppercase tracking-wider">Storage Permission</span>
                    </div>
                    <div className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Granted</div>
                  </div>
                  <p className="mt-3 text-[9px] text-gray-600 text-center italic">
                    By using Sling, you agree to our use of local storage for session management.
                  </p>
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
