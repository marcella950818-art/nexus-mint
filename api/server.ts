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
      // 1. Firecrawl (适配 v2 规范)
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

      // 2. Gemini (修正模型名称为最稳的 gemini-1.5-flash-latest)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }, { apiVersion: 'v1' });
      const prompt = `Return JSON: {"title":"","article":"","tags":[]}. Content: ${content.substring(0, 4000)}`;
      
      const result = await model.generateContent(prompt);
      const aiResponse = await result.response; // 这里加上 await 是安全的，因为我们已经避开了硬崩溃
      const aiText = aiResponse.text();
      
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      const ai = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "解析失败", article: aiText };

      // 3. Supabase 写入 (这里是入库，必须用 article，绝不动它)
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: ai.title || "Untitled",
        article: ai.article || "", // 核心：入库字段名保持不变
        tags: ai.tags || [],
        level: [3]
      }]).select();

      if (error) throw error;

      // --- 下面就是你要求的“全面逻辑”整合 ---
      
      const record = data[0]; // 获取刚存进数据库的那一行原始数据
      
      // 这里的逻辑就是你刚才提到的：确保 level 是数组，tags 是安全的
      const safeLevel = Array.isArray(record.level) ? record.level[0] : (record.level || 3);
      const safeTags = (Array.isArray(record.tags) && record.tags.length > 0) ? record.tags : ["未分类"];

      // 构造最终返回给前端的“全兼容”对象
      const finalResponse = {
        ...record,               // A. 保留所有原始字段 (包含 id, url, title, article)
        level: [safeLevel],      // B. 确保输出格式依然是 Postman 看到的 [3] (兼容 Python)
        tags: safeTags,          // C. 确保标签不为空
        summary: record.article, // D. 新增：前端 2.5D 卡片专用字段 (解决摘要空白)
        displayLevel: safeLevel  // E. 新增：前端进度条专用纯数字
      };

      // 最终发出，三方满意：数据库收到了内容，Python 拿到了 article，前端拿到了 summary
      return res.status(200).json(finalResponse);

    } catch (err: any) {
      console.error(err);
      return res.status(200).json({ error: true, message: err.message });
    }
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return res.status(200).json(data || []);
  }
}
