import { VercelRequest, VercelResponse } from '@vercel/node';

// 内存存储（临时，仅供测试连通性）
let linksStore: any[] = [];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 接收脚本发送的链接 (POST)
  if (req.method === 'POST') {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL" });

    const newEntry = {
      id: Date.now(),
      url: url,
      title: "🚀 捕获成功 (内存模式)",
      time: new Date().toLocaleString()
    };

    linksStore.push(newEntry);
    console.log("已存入内存:", url);
    return res.status(200).json({ success: true, entry: newEntry });
  }

  // 网页读取链接 (GET)
  if (req.method === 'GET') {
    return res.status(200).json(linksStore);
  }

  return res.status(405).end();
}
