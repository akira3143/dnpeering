import React from 'react';
import { useRouter } from '../router/Router';
import { usePeering } from '../context/PeeringContext';
import { useAuth } from '../context/AuthContext';
import { HeroTelemetry } from '../components/HeroTelemetry';
import { NodeGrid } from '../components/NodeGrid';
import { LookingGlass } from '../components/LookingGlass';

export const HomePage: React.FC = () => {
  const { navigate } = useRouter();
  const { setTargetNodeId } = usePeering();
  const { isAuthenticated, setIsAuthModalOpen } = useAuth();

  const handleSelectNode = (nodeId: string) => {
    setTargetNodeId(nodeId);
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    navigate(`/peer?node=${nodeId}`);
  };

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* 1. Hero & Network Telemetry Overview */}
      <HeroTelemetry />

      {/* 2. Global Available PoP Nodes (Card Grid & Detailed Table views) */}
      <NodeGrid onSelectNode={handleSelectNode} />

      {/* 3. Real-time Looking Glass & BGP Network Inspector */}
      <LookingGlass />
    </div>
  );
};
