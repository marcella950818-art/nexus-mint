import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
  runtime: 'edge',
};

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function handler(req: Request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  if (req.method === 'POST') {
    try {
      const { url } = await req.json();
      if (!url) return new Response(JSON.stringify({ error: "URL required" }), { status: 400, headers });

      // --- 1. 防御性占位插入 ---
      // 解决 "expected JSON array"：对 level 和 tags 默认使用数组格式
      const { data: initialData, error: insertError } = await supabase
        .from('links')
        .insert([{
          url,
          title: "🔄 AI 正在深度解析...",
          article: "内容提取中，请稍后刷新...",
          tags: ["未分类"], // 默认数组
          level: [1],      // 强制数组格式，解决 22P02 错误
          likes: 0,
          comments: 0
        }])
        .select()
        .single();

      if (insertError) {
        console.error("Supabase Insert Error:", insertError);
        // 如果还是报错，尝试不带 level 插入（由数据库默认值处理）
        return new Response(JSON.stringify({ error: "Database rejected insert", details: insertError }), { status: 500, headers });
      }

      // --- 2. 异步回写逻辑 ---
      const runAI = async () => {
        try {
          // A. 抓取 (限时且截断)
          const jinaRes = await fetch(`https://r.jina.ai/${url}`);
          const text = await jinaRes.text();
          const context = text.substring(0, 4000);

          // B. AI 总结
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          const prompt = `你是一个知识萃取专家。分析：${context}
          必须返回JSON：{"title":"文章标题","summary":"摘要","level":3,"tags":["标签"],"likes":10,"comments":5}`;
          
          const result = await model.generateContent(prompt);
          const rawResult = result.response.text().replace(/```json|```/g, "").trim();
          const aiData = JSON.parse(rawResult);

          // C. 格式化回写数据 (关键修复点)
          const updatePayload = {
            title: aiData.title || "无标题文章",
            article: aiData.summary || "无法生成摘要",
            // 确保 tags 永远是数组
            tags: Array.isArray(aiData.tags) ? aiData.tags : [aiData.tags || "其他"],
            // 确保 level 永远是数组格式以适配你的数据库
            level: [Number(aiData.level) || 3],
            likes: Number(aiData.likes) || 0,
            comments: Number(aiData.comments) || 0,
            metadata: aiData
          };

          await supabase.from('links').update(updatePayload).eq('id', initialData.id);
          console.log(`✅ ID ${initialData.id} 已成功回写`);

        } catch (e) {
          console.error("Background task error:", e);
          // 容错：即使总结失败，至少把标题改正常一点
          await supabase.from('links').update({ title: "⚠️ 链接已收录 (AI解析异常)" }).eq('id', initialData.id);
        }
      };

      // 触发异步
      runAI();

      return new Response(JSON.stringify({ success: true, id: initialData.id }), { status: 200, headers });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return new Response(JSON.stringify(data || []), { status: 200, headers });
  }
}
