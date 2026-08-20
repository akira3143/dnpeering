import React, { useEffect } from 'react';
import { RouterProvider, useRouter } from './router/Router';
import { ToastProvider } from './components/Toast';
import { NetworkProvider } from './context/NetworkContext';
import { PeeringProvider } from './context/PeeringContext';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { PeerPage } from './pages/PeerPage';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { MyPeeringsDashboard } from './components/MyPeeringsDashboard';

const AppContent: React.FC = () => {
  const { path } = useRouter();
  const isPeerPage = path.startsWith('/peer');

  // Lock background scroll when Peering Studio overlay is open to preserve home scroll position perfectly
  useEffect(() => {
    if (isPeerPage) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isPeerPage]);

  return (
    <div className="w-full min-h-screen flex flex-col justify-between bg-[#06080d] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Top Sticky Navigation Bar */}
      <Navbar />

      {/* Main Home Page Content (Preserved in background, 0 scroll jump) */}
      <main className="w-full flex-grow">
        <HomePage />
      </main>

      {/* Main Footer */}
      <Footer />

      {/* Auth Modal & Dashboard Modals */}
      <AuthModal />
      <MyPeeringsDashboard />

      {/* Dedicated Peering Studio Fullscreen View (Zero Scroll-Jump, Preserves Background Scroll) */}
      {isPeerPage && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#06080d] flex flex-col justify-between animate-in fade-in duration-200">
          <PeerPage />
          <Footer />
        </div>
      )}

    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <RouterProvider>
        <AuthProvider>
          <NetworkProvider>
            <PeeringProvider>
              <AppContent />
            </PeeringProvider>
          </NetworkProvider>
        </AuthProvider>
      </RouterProvider>
    </ToastProvider>
  );
};

export default App;
