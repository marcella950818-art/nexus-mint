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

      // 3. Supabase 写入
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: ai.title || "Untitled",
        article: ai.article || "",
        tags: ai.tags || [],
        level: [3]
      }]).select();

      if (error) throw error;
      return res.status(200).json(data[0]);

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
