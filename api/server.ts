import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 🚀 强制启用 Edge Runtime，避开 Vercel 10s 限制并支持异步
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

  // 处理跨域请求
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  // --- 处理录入 (POST) ---
  if (req.method === 'POST') {
    try {
      const { url } = await req.json();
      if (!url) return new Response(JSON.stringify({ error: "URL is required" }), { status: 400, headers });

      // 1. 【第一步：占位】先存入 URL，标题设为“处理中”，拿到该条记录的 ID
      const { data: initialData, error: insertError } = await supabase
        .from('links')
        .insert([{
          url,
          title: "🔄 AI 正在总结中...",
          article: "正在抓取网页内容并解析，请稍候...",
          tags: ["处理中"],
          level: 1
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. 【核心：异步处理函数】不加 await，让它在后台跑
      const processInBackgroundTask = async () => {
        try {
          // A. 使用 Jina 抓取文本
          const jinaRes = await fetch(`https://r.jina.ai/${url}`);
          const rawText = await jinaRes.text();
          const cleanText = rawText.substring(0, 5000); // 截取前5000字，节省流量

          // B. 调用 Gemini 生成总结
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          const prompt = `分析文章内容：${cleanText}
          请严格返回 JSON 格式：{"title":"文章标题","summary":"3句内摘要","level":3,"tags":["AI工具"]}
          注意：tags 必须从 [AI工具, 个人成长, AI短剧, Vibecoding, 自媒体, 其他] 中选择。`;

          const result = await model.generateContent(prompt);
          const aiText = result.response.text().replace(/```json|```/g, "").trim();
          const aiData = JSON.parse(aiText);

          // C. 【关键：回写字段】根据 ID 更新除了 URL 之外的所有字段
          const { error: updateError } = await supabase
            .from('links')
            .update({
              title: aiData.title,
              article: aiData.summary,
              tags: aiData.tags,
              level: aiData.level,
              metadata: aiData // 存入完整的 AI 返回 JSON
            })
            .eq('id', initialData.id);

          if (updateError) console.error("Update Error:", updateError);
          else console.log(`✅ ID ${initialData.id} 已完成 AI 总结回写`);

        } catch (err) {
          console.error("Background AI Process Failed:", err);
          // 失败了就把标题改为“解析失败”，方便用户知道
          await supabase.from('links').update({ title: "❌ AI 解析失败 (内容过长或受限)" }).eq('id', initialData.id);
        }
      };

      // 3. 【非阻塞触发】启动后台任务，但不等待它完成
      // 在 Edge Runtime 中，这会允许 Response 先发出，后台继续跑一会
      processInBackgroundTask();

      // 4. 【秒回响应】直接告诉 Python 脚本“收到了”，耗时通常 < 1秒
      return new Response(JSON.stringify({ 
        success: true, 
        message: "已进入后台处理队列", 
        id: initialData.id 
      }), { status: 200, headers });

    } catch (err: any) {
      console.error("Main Process Error:", err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  // --- 处理读取 (GET) ---
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('links').select('*').order('id', { ascending: false });
    if (error) return new Response(JSON.stringify(error), { status: 500, headers });
    return new Response(JSON.stringify(data || []), { status: 200, headers });
  }
}
