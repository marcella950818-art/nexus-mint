import React, { useState } from 'react';
import { motion } from 'motion/react';
import { TrayConfig, CardData } from '../types';
import { TRAYS } from '../constants';
import { Card } from './Card';

interface TrayProps {
  config: TrayConfig;
  cards: CardData[];
  onCardClick: (card: CardData) => void;
  onTrayClick: (tag: string) => void;
  searchQuery: string;
}

export const Tray: React.FC<TrayProps> = ({ config, cards, onCardClick, onTrayClick, searchQuery }) => {
  const [isHovered, setIsHovered] = useState(false);

  const allTags = TRAYS.map(t => t.tag);
  const filteredCards = cards.filter(c => {
    if (config.tag === '其他') {
      // "其他" tray shows cards with "其他" tag OR cards whose tags don't match any tray
      return c.tags.includes('其他') || !c.tags.some(t => allTags.includes(t));
    }
    return c.tags.includes(config.tag);
  });
  
  // Check if this tray should be dimmed based on search
  const hasMatch = searchQuery === '' || filteredCards.some(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate stack thickness based on card count
  const stackThickness = Math.min(filteredCards.length * 2, 60); // Max 60px thickness

  return (
    <div 
      className={`relative w-full h-full flex items-center justify-center transition-opacity duration-500 ${hasMatch ? 'opacity-100' : 'opacity-20'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onTrayClick(config.tag)}
    >
      {/* Tray Label & Badge */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8 z-50 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 bg-white/80 px-3 py-1 rounded-full shadow-sm backdrop-blur-sm whitespace-nowrap">
          {config.tag} ({filteredCards.length})
        </span>
      </div>

      {/* Isometric Surface */}
      <div 
        className={`tray-surface w-[300px] h-[400px] rounded-3xl ${config.bgColor} border-2 border-white/50 shadow-2xl backdrop-blur-md relative ${isHovered ? 'tray-active' : ''}`}
        style={{ 
          '--stack-thickness': `${stackThickness}px`,
          boxShadow: `0 ${stackThickness}px 0 rgba(0,0,0,0.1), 0 20px 40px rgba(0,0,0,0.1)`
        } as any}
      >
        {/* Visual Stack Layers for extra depth */}
        {filteredCards.length > 5 && (
          <div className="absolute inset-0 -z-10 translate-y-[4px] translate-x-[4px] rounded-3xl bg-black/5 border border-white/20" />
        )}
        {filteredCards.length > 15 && (
          <div className="absolute inset-0 -z-20 translate-y-[8px] translate-x-[8px] rounded-3xl bg-black/5 border border-white/20" />
        )}
        
        {/* Card Stack */}
        <div className="absolute inset-0 flex items-center justify-center">
          {filteredCards.map((card, idx) => {
            const isDimmed = searchQuery !== '' && !card.title.toLowerCase().includes(searchQuery.toLowerCase()) && !card.summary.toLowerCase().includes(searchQuery.toLowerCase());
            return (
              <Card 
                key={`${config.tag}-${card.id}`}
                card={card}
                index={idx}
                total={filteredCards.length}
                isTrayHovered={isHovered}
                onClick={onCardClick}
                isDimmed={isDimmed}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
