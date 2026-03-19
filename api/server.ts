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

      // 保持之前的 2.5 和 v1 配置不变
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }, { apiVersion: 'v1' });
      
      // --- 仅修改此处的 Prompt 标签分类逻辑 ---
      const prompt = `
        You are a content analyzer. Analyze the web content and return JSON.
        
        CLASSIFICATION RULE:
        You MUST pick exactly ONE tag from this specific list for the "tags" field: 
        ["AI工具", "个人成长", "AI短剧", "VIBE CODING", "自媒体", "其他"]

        INSTRUCTIONS:
        - "AI工具": About AI models, software, or platforms.
        - "个人成长": About learning, habits, or self-improvement.
        - "AI短剧": About AI video generation or short drama.
        - "VIBE CODING": About AI-assisted coding (Cursor, Replit, etc.).
        - "自媒体": About content creation or social media growth.
        - "其他": Use this if none of the above match.

        REQUIRED JSON FORMAT (Values in Chinese):
        {
          "title": "网页标题",
          "article": "详细正文内容",
          "summary": "150字以内精华摘要",
          "tags": ["从上述列表中选一个"], 
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

      // 保持写入逻辑不变，确保入库安全
      const { data, error } = await supabase.from('links').insert([{
        url: url,
        title: ai.title || "Untitled",
        article: ai.article || "",
        summary: ai.summary || "",
        tags: ai.tags || ["其他"],
        level: [ai.level || 3]
      }]).select();

      if (error) throw error;

      // 保持返回逻辑不变，确保字段冗余显示
      const record = data[0];
      return res.status(200).json({
        ...record,
        summary: record.summary || record.article,
        displayLevel: Array.isArray(record.level) ? record.level[0] : 3
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
