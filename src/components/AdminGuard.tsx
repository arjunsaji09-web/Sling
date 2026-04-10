import { Navigate } from 'react-router-dom';
import { useAuth } from '../App';
import { ReactNode } from 'react';

interface AdminGuardProps {
  children: ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white font-sans">
        <div className="w-20 h-20 gradient-bg rounded-[24px] flex items-center justify-center shadow-[0_20px_50px_rgba(168,85,247,0.2)]">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user || role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
