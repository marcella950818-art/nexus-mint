export type Tag = 'AI工具' | '个人成长' | 'AI短剧' | 'Vibecoding' | '自媒体' | '其他';

export interface CardData {
  id: string;
  title: string;
  url: string;
  summary: string;
  level: number; // 1-5
  tags: Tag[];
  likes: number;
  comments: number;
  createdAt: string;
}

export interface TrayConfig {
  tag: Tag;
  color: string;
  bgColor: string;
}
