import { useState, useEffect } from 'react';
import { collection, query, getDocs, deleteDoc, doc, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'framer-motion';
import { Shield, Users, MessageSquare, Trash2, Search, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'messages'>('users');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (activeTab === 'users') {
          const q = query(collection(db, 'users'), limit(50));
          const snapshot = await getDocs(q);
          setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(50));
          const snapshot = await getDocs(q);
          setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('Error fetching admin data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab]);

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'messages', msgId));
      setMessages(messages.filter(m => m.id !== msgId));
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <header className="max-w-6xl mx-auto flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Control</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        <div className="flex bg-white/5 p-1 rounded-2xl mb-8 w-fit">
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'users' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Users className="w-4 h-4" />
            Users
          </button>
          <button 
            onClick={() => setActiveTab('messages')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'messages' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <MessageSquare className="w-4 h-4" />
            Messages
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-white/10 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="glass rounded-3xl overflow-hidden">
            {activeTab === 'users' ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">User</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Role</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Joined</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden">
                            {u.photoURL && <img src={u.photoURL} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <span className="font-medium">@{u.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-gray-400'}`}>
                          {u.role || 'user'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {u.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Message</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Recipient</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Sent</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {messages.map(m => (
                    <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm line-clamp-1 max-w-xs">{m.text}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {m.recipientUid}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {m.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDeleteMessage(m.id)}
                          className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
