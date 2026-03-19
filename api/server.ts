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
      // 1. Firecrawl - 使用最基础的 v1 格式
      const fcRes = await fetch(`https://api.firecrawl.dev/v1/scrape`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` 
        },
        body: JSON.stringify({ url, formats: ["markdown"] })
      });

      const fcData = await fcRes.json();
      const content = fcData.data?.markdown || "No content";

      // 2. Gemini - 使用最稳的调用方式
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Return JSON: {"title":"","article":"","tags":[]}. Content: ${content.substring(0, 4000)}`;
      
      const result = await model.generateContent(prompt);
      // 注意：这里不再对 response.text() 使用双重 await，直接取结果
      const aiResponse = result.response;
      const aiText = aiResponse.text(); 
      
      // 暴力提取 JSON
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      const ai = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "解析失败", article: aiText };

      // 3. Supabase - 写入
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
      // 发生任何错误，至少返回一个正常的 JSON，防止 Vercel 抛出 FUNCTION_INVOCATION_FAILED
      console.error(err);
      return res.status(200).json({ error: true, message: err.message });
    }
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return res.status(200).json(data || []);
  }
}
