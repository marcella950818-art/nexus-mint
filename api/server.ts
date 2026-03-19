import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function (req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { url } = req.body;
    try {
      const fcRes = await fetch(`https://api.firecrawl.dev/v1/scrape`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` 
        },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true })
      });
      const fcData = await fcRes.json();
      const content = fcData.data?.markdown || "No content found";

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }, { apiVersion: 'v1' });
      
      const prompt = `
        You are a content analyzer. Analyze the web content and return JSON.
        
        RULES:
        1. TAGS: Pick exactly ONE from: ["AI工具", "个人成长", "AI短剧", "VIBE CODING", "自媒体", "其他"]
        2. LEVEL (Difficulty): Rate from 1 to 5:
           - 1-2: Easy, news, or quick tips.
           - 3: Standard analysis or practical guides.
           - 4-5: Deep technical details, research, or complex logic.
        3. CONTENT: "article" for full text, "summary" for 150-char summary.

        REQUIRED JSON FORMAT (Values in Chinese):
        {
          "title": "网页标题",
          "article": "详细正文内容",
          "summary": "精炼摘要",
          "tags": ["分类标签"], 
          "level": 3 
        }

        CONTENT:
        ${content.substring(0, 3500)}
      `;
      
      const result = await model.generateContent(prompt);
      const aiResponse = await result.response;
      const aiText = aiResponse.text();
      
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      const ai = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        title: "解析失败", 
        article: content.substring(0, 2000), 
        summary: "摘要生成失败",
        tags: ["其他"],
        level: 3 
      };

      // 关键修复：从 ai 对象里动态获取 level，如果没有则默认为 3
      const finalLevel = (typeof ai.level === 'number' && ai.level >= 1 && ai.level <= 5) ? ai.level : 3;

      const { data, error } = await supabase.from('links').insert([{
        url: url,
        title: ai.title || "Untitled",
        article: ai.article || "",
        summary: ai.summary || "",
        tags: ai.tags || ["其他"],
        level: [finalLevel] // 存入 AI 评估的真实分数
      }]).select();

      if (error) throw error;

      const record = data[0];
      return res.status(200).json({
        ...record,
        summary: record.summary || record.article,
        displayLevel: finalLevel
      });

    } catch (err: any) {
      console.error(err);
      return res.status(200).json({ error: true, message: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase.from('links').select('*').order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err: any) {
      return res.status(200).json([]);
    }
  }
}
