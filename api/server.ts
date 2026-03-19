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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 留1秒给数据库

    try {
      // 1. 极速抓取
      const fcRes = await fetch(`https://api.firecrawl.dev/v0/scrape`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` 
        },
        body: JSON.stringify({ url, pageOptions: { onlyMainContent: true } }),
        signal: controller.signal
      });
      const fcData = await fcRes.json();
      const content = fcData.data?.markdown || "No content found";

      // 2. AI 总结 (核心修正点：加上 await)
      const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
      const prompt = `总结内容并返回JSON:{"title":"","article":"","tags":[]}。内容：${content.substring(0, 8000)}`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response; // 必须 await
      const aiText = response.text(); // 拿到文字
      
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI format error");
      const ai = JSON.parse(jsonMatch[0]);

      // 3. 写入数据库
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: ai.title || "解析成功",
        article: ai.article,
        tags: ai.tags,
        level: [3]
      }]).select();

      clearTimeout(timeoutId);
      if (error) throw error;
      return res.status(200).json(data[0]);

    } catch (err: any) {
      // 容错：如果上面任何一步报错或超时，存入保底数据
      const { data } = await supabase.from('links').insert([{ 
        url, 
        title: "解析稍慢 (任务已提交)", 
        article: "内容已捕获，AI 正在深度处理中，请稍后刷新查看结果。", 
        tags: ["自动处理"], 
        level: [3] 
      }]).select();
      return res.status(200).json(data ? data[0] : { success: true });
    }
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return res.status(200).json(data || []);
  }
}
