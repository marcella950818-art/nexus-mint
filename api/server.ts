import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 这里的 Key 必须是你刚才找到的以 eyJ 开头的那个！
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function (req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing URL" });

    try {
      // 1. 立即入库（确保 Python 和网页录入秒成）
      const { data: row, error: insErr } = await supabase
        .from('links')
        .insert([{
          url,
          title: "🔄 AI 正在萃取精华...",
          article: "抓取中，请稍后刷新查看",
          tags: ["自动收录"],
          level: [1] // 适配你数据库的数组格式
        }])
        .select().single();

      if (insErr) throw insErr;

      // 2. 关键：先给前端/Python返回成功，断开连接
      res.status(200).json({ success: true, id: row.id });

      // 3. 异步回写（利用 Vercel 剩余的几秒钟干活）
      try {
        const jinaRes = await fetch(`https://r.jina.ai/${url}`);
        const text = await jinaRes.text();
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`总结 JSON: ${text.substring(0, 1500)}`);
        const ai = JSON.parse(result.response.text().replace(/```json|```/g, ""));

        await supabase.from('links').update({
          title: ai.title || ai.t,
          article: ai.summary || ai.s,
          tags: Array.isArray(ai.tags) ? ai.tags : [ai.tags || "AI"],
          level: [Number(ai.level) || 3]
        }).eq('id', row.id);
      } catch (e) {
        console.error("AI Backfill failed, but record kept.");
      }
    } catch (err: any) {
      if (!res.writableEnded) res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return res.status(200).json(data || []);
  }
}
