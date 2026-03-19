import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. 获取所有卡片 (对应前端 fetchCards)
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('links').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json(error);
    
    // 确保 tags 是数组格式传给前端
    const formattedData = data.map(item => ({
      ...item,
      tags: Array.isArray(item.tags) ? item.tags : JSON.parse(item.tags || '["其他"]')
    }));
    return res.status(200).json(formattedData);
  }

  // 2. 录入新链接 (对应前端 handleIngest)
  if (req.method === 'POST') {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });

    try {
      // 使用 jina.ai 读取内容
      const jinaRes = await fetch(`https://r.jina.ai/${url}`);
      const content = await jinaRes.text();

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `分析文章：${content.substring(0, 10000)}... 
      严格返回JSON：{"title":"标题","summary":"3句摘要","level":3,"tags":["AI工具"],"likes":120,"comments":15}`;

      const aiResult = await model.generateContent(prompt);
      const aiData = JSON.parse(aiResult.response.text().replace(/```json|```/g, ""));

      // 存入 Supabase
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: aiData.title,
        summary: aiData.summary, // 注意：字段名改为 summary
        level: aiData.level,
        tags: aiData.tags,
        likes: aiData.likes,
        comments: aiData.comments
      }]).select();

      return res.status(200).json(data[0]);
    } catch (err) {
      return res.status(500).json({ error: "AI解析失败，请检查API Key" });
    }
  }
}
