import React from 'react';
import { motion } from 'motion/react';
import { Heart, MessageCircle } from 'lucide-react';
import { CardData } from '../types';

interface CardProps {
  card: CardData;
  index: number;
  total: number;
  isTrayHovered: boolean;
  onClick: (card: CardData) => void;
  isDimmed: boolean;
}

export const Card: React.FC<CardProps> = ({ card, index, total, isTrayHovered, onClick, isDimmed }) => {
  // Calculate stack position
  const baseZ = (card.level - 1) * 2;
  
  // Fan-out logic
  // Cards fan out in a clean arc from the bottom-left corner
  const maxFanAngle = 45; // Total fan spread in degrees
  const startAngle = -15; // Starting angle for the first card
  const fanAngle = isTrayHovered 
    ? startAngle + (index * (maxFanAngle / Math.max(1, total - 1))) 
    : 0;
  
  const fanX = isTrayHovered ? (index - (total / 2)) * 15 : 0;
  const fanY = isTrayHovered ? -index * 8 : 0;
  const fanZ = isTrayHovered ? index * 2 : baseZ;

  return (
    <motion.div
      className={`card-stack-item ${isDimmed ? 'opacity-20 grayscale' : 'opacity-100'}`}
      style={{
        '--z-offset': `${fanZ}px`,
        '--fan-angle': `${fanAngle}deg`,
        '--fan-x': `${fanX}px`,
        '--fan-y': `${fanY}px`,
        zIndex: card.level + (total - index), // Newer cards on top
        top: '50%',
        left: '50%',
        width: '200px',
        height: '120px',
        marginLeft: '-100px',
        marginTop: '-60px',
      } as any}
      whileHover={{ 
        scale: 1.15, 
        zIndex: 500,
        translateY: -40,
        rotate: 0,
        transition: { type: 'spring', stiffness: 300, damping: 20 }
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(card);
      }}
    >
      <div className="flex flex-col h-full justify-between">
        <div>
          <h3 className="text-sm font-bold line-clamp-2 leading-tight mb-1">{card.title}</h3>
          <p className="text-[10px] text-gray-500 line-clamp-2 leading-tight">
            {card.summary}
          </p>
        </div>
        
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/5">
          <div className="flex gap-3">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <Heart size={10} /> {card.likes}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <MessageCircle size={10} /> {card.comments}
            </span>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
            card.level >= 4 ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
          }`}>
            Lv.{card.level}
          </span>
        </div>
      </div>
    </motion.div>
  );
};
