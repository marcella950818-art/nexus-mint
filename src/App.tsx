import React, { useState, useEffect } from 'react';
import { Search, Plus, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { TRAYS } from './constants';
import { CardData } from './types';
import { Tray } from './components/Tray';
import { DetailPanel } from './components/SummaryPanel';

export default function App() {
  const [cards, setCards] = useState<CardData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      const res = await fetch('/api/cards');
      const data = await res.json();
      setCards(data);
    } catch (err) {
      console.error('Failed to fetch cards:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;
    
    setIsIngesting(true);
    try {
      // Call the new backend ingest endpoint
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl }),
      });

      if (res.ok) {
        setNewUrl('');
        await fetchCards();
        alert('知识录入成功！');
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || '录入失败');
      }
    } catch (err: any) {
      console.error('Ingest failed:', err);
      alert(`录入失败: ${err.message || '请检查后端服务是否正常。'}`);
    } finally {
      setIsIngesting(false);
    }
  };

  // Calculate total cards correctly from state
  const totalCards = cards.length;

  return (
    <div className="min-h-screen w-full flex flex-col">
      {/* Header / Search Bar */}
      <header className="fixed top-0 left-0 w-full z-[80] p-6 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-xl">
            <Sparkles className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter">NEXUS MINT</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">2.5D Knowledge Vault</p>
          </div>
        </div>

        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Search knowledge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 md:w-96 bg-white/80 backdrop-blur-md border border-black/5 rounded-2xl py-3 pl-12 pr-4 shadow-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
            />
          </div>

          <form onSubmit={handleIngest} className="flex items-center gap-2">
            <input 
              type="url"
              placeholder="Paste link to ingest..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="hidden md:block w-48 bg-white/80 backdrop-blur-md border border-black/5 rounded-2xl py-3 px-4 shadow-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
            />
            <button 
              type="submit"
              disabled={isIngesting}
              className="w-12 h-12 bg-white border border-black/5 rounded-2xl flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isIngesting ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            </button>
          </form>
        </div>
      </header>

      {/* Main 2.5D Stage */}
      <main className="flex-1 relative isometric-container overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="animate-spin text-gray-300" size={48} />
          </div>
        ) : (
          <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-24 gap-x-0 p-12 md:p-24 overflow-y-auto">
            {TRAYS.map((tray) => (
              <Tray 
                key={tray.tag}
                config={tray}
                cards={cards}
                onCardClick={(card) => {
                  setSelectedTag(tray.tag);
                  // We'll handle the card selection inside the DetailPanel
                }}
                onTrayClick={setSelectedTag}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer Stats */}
      <footer className="fixed bottom-0 left-0 w-full p-6 flex justify-between items-end pointer-events-none">
        <div className="bg-white/50 backdrop-blur-md border border-black/5 rounded-xl px-4 py-2 shadow-sm pointer-events-auto">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">System Status</span>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium">AI Core Active</span>
          </div>
        </div>

        <div className="flex gap-4 pointer-events-auto">
          <div className="bg-white/50 backdrop-blur-md border border-black/5 rounded-xl px-4 py-2 shadow-sm text-right">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Cards</span>
            <p className="text-lg font-black leading-none">{totalCards}</p>
          </div>
        </div>
      </footer>

      {/* Detail Panel */}
      <DetailPanel 
        selectedTag={selectedTag}
        cards={cards}
        onClose={() => setSelectedTag(null)}
      />
    </div>
  );
}
