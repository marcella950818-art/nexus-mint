import { createClient } from '@supabase/supabase-js';
import { VercelRequest, VercelResponse } from '@vercel/node';

// 这里的名字必须和你在 Vercel 后台填写的变量名一模一样
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

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
    if (!url) return res.status(400).json({ error: "No URL provided" });

    // 存入 Supabase 云端数据库的 links 表
    const { data, error } = await supabase
      .from('links')
      .insert([{ url: url, title: '捕获成功' }]);

    if (error) {
      console.error("Supabase 插入错误:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  }

  // 网页读取链接 (GET)
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('links')
      .select('*')
      .order('id', { ascending: false }); // 最新的排在前面

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).end();
}
