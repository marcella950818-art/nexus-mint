import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Heart, MessageCircle, Calendar, Tag, ChevronLeft, Star, BarChart3 } from 'lucide-react';
import { CardData } from '../types';
import { TRAYS } from '../constants';

interface DetailPanelProps {
  selectedTag: string | null;
  cards: CardData[];
  onClose: () => void;
}

type SortMode = 'recommended' | 'difficulty' | 'time';

export const DetailPanel: React.FC<DetailPanelProps> = ({ selectedTag, cards, onClose }) => {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recommended');

  const filteredCards = useMemo(() => {
    if (!selectedTag) return [];
    
    const allTags = TRAYS.map(t => t.tag);
    const list = cards.filter(c => {
      if (selectedTag === '其他') {
        return c.tags.includes('其他') || !c.tags.some(t => allTags.includes(t));
      }
      return c.tags.includes(selectedTag);
    });
    
    return [...list].sort((a, b) => {
      if (sortMode === 'recommended') return b.likes - a.likes;
      if (sortMode === 'difficulty') return b.level - a.level;
      if (sortMode === 'time') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0;
    });
  }, [selectedTag, cards, sortMode]);

  const handleClose = () => {
    setSelectedCard(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {selectedTag && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/10 backdrop-blur-sm z-[100]"
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-full max-w-lg glass-panel z-[101] flex flex-col"
          >
            <div className="p-8 flex-1 overflow-y-auto relative">
              <button 
                onClick={handleClose}
                className="absolute top-6 right-6 p-2 hover:bg-black/5 rounded-full transition-colors z-50"
              >
                <X size={20} />
              </button>

              <AnimatePresence mode="wait">
                {!selectedCard ? (
                  /* Layer 1: List View */
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    <div>
                      <h2 className="text-3xl font-black tracking-tighter mb-2">{selectedTag}</h2>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Knowledge Collection</p>
                    </div>

                    {/* Sort Tabs */}
                    <div className="flex p-1 bg-black/5 rounded-xl w-fit">
                      {(['recommended', 'difficulty', 'time'] as SortMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setSortMode(mode)}
                          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                            sortMode === mode ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          {mode === 'recommended' ? '推荐度' : mode === 'difficulty' ? '难易度' : '时间'}
                        </button>
                      ))}
                    </div>

                    {/* List */}
                    <div className="space-y-3">
                      {filteredCards.map((card) => (
                        <motion.div
                          key={card.id}
                          layoutId={card.id}
                          onClick={() => setSelectedCard(card)}
                          className="group p-4 bg-white/50 hover:bg-white rounded-2xl border border-black/5 cursor-pointer transition-all hover:shadow-md flex items-center justify-between"
                        >
                          <div className="flex-1 pr-4">
                            <h4 className="font-bold text-sm group-hover:text-black transition-colors">{card.title}</h4>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="flex items-center gap-1 text-[10px] text-gray-400">
                                <Star size={10} className="fill-yellow-400 text-yellow-400" /> {card.likes}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-gray-400">
                                <BarChart3 size={10} /> Lv.{card.level}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(lvl => (
                              <div 
                                key={lvl}
                                className={`w-1.5 h-4 rounded-full ${lvl <= card.level ? 'bg-black/80' : 'bg-black/5'}`}
                              />
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  /* Layer 2: Detail View */
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
                    <button 
                      onClick={() => setSelectedCard(null)}
                      className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-black transition-colors"
                    >
                      <ChevronLeft size={16} /> Back to List
                    </button>

                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        {selectedCard.tags.map(tag => (
                          <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-black/5 rounded-md text-gray-600 flex items-center gap-1">
                            <Tag size={10} /> {tag}
                          </span>
                        ))}
                      </div>

                      <h2 className="text-3xl font-black leading-tight mb-6">{selectedCard.title}</h2>
                      
                      <div className="flex items-center gap-6 mb-8 text-sm text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <Heart size={16} className="text-pink-500" /> {selectedCard.likes}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MessageCircle size={16} className="text-blue-500" /> {selectedCard.comments}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Calendar size={16} /> {selectedCard.createdAt}
                        </span>
                      </div>

                      <div className="space-y-8">
                        <section>
                          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Summary</h3>
                          <p className="text-gray-700 leading-relaxed text-xl italic font-serif">
                            "{selectedCard.summary}"
                          </p>
                        </section>

                        <section>
                          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Difficulty Level</h3>
                          <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5].map(lvl => (
                              <div 
                                key={lvl}
                                className={`h-3 flex-1 rounded-full transition-all duration-500 ${lvl <= selectedCard.level ? 'bg-black' : 'bg-black/5'}`}
                                style={{ transform: lvl <= selectedCard.level ? 'scaleY(1)' : 'scaleY(0.6)' }}
                              />
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-3 font-bold uppercase tracking-widest">
                            Level {selectedCard.level} of 5 — {selectedCard.level >= 4 ? 'Advanced Deep Dive' : 'Foundational Knowledge'}
                          </p>
                        </section>

                        <div className="pt-8">
                          <a 
                            href={selectedCard.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-5 bg-black text-white rounded-2xl font-bold hover:bg-gray-800 transition-all hover:shadow-xl active:scale-[0.98]"
                          >
                            Read Original Article <ExternalLink size={18} />
                          </a>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

