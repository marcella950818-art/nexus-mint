import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
// 适配你的变量名 GEMINI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      // 1. Jina 抓取内容
      const jinaRes = await fetch(`https://r.jina.ai/${url}`);
      const content = await jinaRes.text();

      // 2. Gemini 总结
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `分析文章：${content.substring(0, 10000)}... 
      严格返回 JSON：{"title":"标题","summary":"3句内摘要","level":3,"tags":["AI工具"],"likes":100,"comments":10}`;

      const result = await model.generateContent(prompt);
      const aiData = JSON.parse(result.response.text().replace(/```json|```/g, ""));

      // 3. 写入 Supabase (注意：tags 会转成字符串存入，防止数据库类型报错)
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: aiData.title,
        article: aiData.summary, 
        tags: JSON.stringify(aiData.tags), 
        metadata: aiData 
      }]).select();

      if (error) throw error;
      return res.status(200).json({ success: true, data: data[0] });
    } catch (err: any) {
      return res.status(500).json({ error: "AI Processing Error" });
    }
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    const formattedData = (data || []).map(item => ({
      ...item,
      tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || ["其他"])
    }));
    return res.status(200).json(formattedData);
  }
}
