import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 跨域处理 (保证 Python 脚本能访问)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // --- 录入逻辑 (POST) ---
  if (req.method === 'POST') {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      // 1. 使用 jina.ai 抓取网页内容
      const jinaRes = await fetch(`https://r.jina.ai/${url}`);
      const content = await jinaRes.text();

      // 2. 调用 Gemini 总结 (使用 flash 模型速度更快，不易超时)
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `分析文章：${content.substring(0, 10000)}... 
      严格返回 JSON：{"title":"标题","summary":"3句内摘要","level":3,"tags":["AI工具"],"likes":100,"comments":10}`;

      const result = await model.generateContent(prompt);
      const aiData = JSON.parse(result.response.text().replace(/```json|```/g, ""));

      // 3. 存入 Supabase (这里article字段存摘要，metadata存原始JSON满足UI展示)
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: aiData.title,
        article: aiData.summary, 
        metadata: aiData // 这里的 level, tags, likes 将作为 metadata 存入 JSONB 列
      }]).select();

      return res.status(200).json({ success: true, data: data[0] });
    } catch (err: any) {
      return res.status(500).json({ error: "AI 处理超时或失败" });
    }
  }

  // --- 读取逻辑 (GET) ---
  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('created_at', { ascending: false });
    // 格式化 tags，确保前端能 map
    const formattedData = (data || []).map(item => ({
      ...item,
      tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || ["其他"])
    }));
    return res.status(200).json(formattedData);
  }
}
