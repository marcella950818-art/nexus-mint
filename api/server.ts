import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { url } = req.body;
    console.log("📥 收到请求 URL:", url); // 日志1

    try {
      // 1. 尝试插入占位符
      console.log("⏳ 正在尝试写入 Supabase...");
      const { data: row, error: insErr } = await supabase
        .from('links')
        .insert([{ 
          url: url, 
          title: "AI解析中...", 
          article: "请刷新", 
          tags: ["AI"], 
          level: [1] 
        }])
        .select()
        .single();

      if (insErr) {
        console.error("❌ Supabase 写入报错:", insErr.message, insErr.details); // 关键报错日志
        return res.status(500).json({ error: "数据库拒绝写入", details: insErr });
      }

      console.log("✅ 数据库占位成功，ID:", row.id);

      // 2. 抓取与解析 (如果这里崩了，至少第一步的数据应该在库里)
      const jinaUrl = `https://r.jina.ai/${url}`;
      const jinaRes = await fetch(jinaUrl);
      const text = await jinaRes.text();
      console.log("📄 Jina 抓取字数:", text.length);

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(`总结 JSON 格式: ${text.substring(0, 1500)}`);
      const aiData = JSON.parse(result.response.text().replace(/```json|```/g, ""));

      // 3. 更新
      await supabase.from('links').update({
        title: aiData.title || aiData.t,
        article: aiData.summary || aiData.s,
        tags: [aiData.tags || "AI"],
        level: [3]
      }).eq('id', row.id);

      console.log("🎉 全流程完成！");
      return res.status(200).json({ success: true });

    } catch (err: any) {
      console.error("💥 运行崩溃:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return res.status(200).json(data || []);
  }
}
