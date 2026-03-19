import React, { useState, useEffect } from 'react';
import { Search, Plus, Loader2, Sparkles } from 'lucide-react';
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
      const res = await fetch('/api/server'); 
      const data = await res.json();
      setCards(data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;
    setIsIngesting(true);
    try {
      const res = await fetch('/api/server', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl }),
      });
      if (res.ok) {
        setNewUrl('');
        await fetchCards();
        alert('录入成功！');
      } else {
        throw new Error('录入失败');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col">
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
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 bg-white/80 backdrop-blur-md border border-black/5 rounded-2xl py-3 pl-12 pr-4 shadow-lg focus:outline-none"
            />
          </div>

          <form onSubmit={handleIngest} className="flex items-center gap-2">
            <input 
              type="url"
              placeholder="Paste link..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="w-48 bg-white/80 border border-black/5 rounded-2xl py-3 px-4 shadow-lg focus:outline-none"
            />
            <button type="submit" disabled={isIngesting} className="w-12 h-12 bg-white border border-black/5 rounded-2xl flex items-center justify-center shadow-lg">
              {isIngesting ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 relative isometric-container overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin" size={48} /></div>
        ) : (
          <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-3 gap-24 p-24 overflow-y-auto">
            {TRAYS.map((tray) => (
              <Tray key={tray.tag} config={tray} cards={cards} onCardClick={() => setSelectedTag(tray.tag)} onTrayClick={setSelectedTag} searchQuery={searchQuery} />
            ))}
          </div>
        )}
      </main>
      
      <DetailPanel selectedTag={selectedTag} cards={cards} onClose={() => setSelectedTag(null)} />
    </div>
  );
}
