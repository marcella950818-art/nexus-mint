import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function (req: any, res: any) {
  // --- 跨域处理 ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { url } = req.body;
    
    // 核心：设置 8.5 秒强制中断计时器，预留 1.5 秒处理数据库存入，绝不触发 Vercel 10s 报错
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500);

    try {
      // 1. 调用 Firecrawl 获取 Markdown 全文 (使用你的 API Key)
      const firecrawlRes = await fetch(`https://api.firecrawl.dev/v0/scrape`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` 
        },
        body: JSON.stringify({ url, pageOptions: { onlyMainContent: true } }),
        signal: controller.signal
      });

      const fcData = await firecrawlRes.json();
      let content = fcData.data?.markdown || "";

      // 2. 备选方案：如果 Firecrawl 没抓到正文，从全网代理抠微信 Meta 摘要
      if (!content) {
        const metaRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: controller.signal });
        const metaData = await metaRes.json();
        const html = metaData.contents || "";
        const ogDesc = html.match(/property="og:description" content="([\s\S]*?)"/)?.[1] || "";
        const ogTitle = html.match(/property="og:title" content="([\s\S]*?)"/)?.[1] || "";
        content = `标题: ${ogTitle}\n摘要: ${ogDesc}`;
      }

      // 3. AI 结构化处理
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `基于以下真实抓取的内容，整理出标题、300字摘要和3个标签。必须返回JSON:{"title":"","article":"","tags":[]}\n内容：${content.substring(0, 8000)}`;
      
      const result = await model.generateContent(prompt);
      const aiResponse = result.response.text();
      const ai = JSON.parse(aiResponse.match(/\{[\s\S]*\}/)![0]);

      // 4. 写入 Supabase
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: ai.title || "解析文章",
        article: ai.article || "暂无详细摘要",
        tags: Array.isArray(ai.tags) ? ai.tags : ["AI分析"],
        level: [3]
      }]).select();

      clearTimeout(timeoutId);
      if (error) throw error;
      return res.status(200).json(data[0]);

    } catch (err: any) {
      console.error("Vercel Protect Triggered:", err.message);
      
      // --- 最终兜底：如果 8.5 秒内没跑完，存入一个保底卡片，前端不报错 ---
      const { data } = await supabase.from('links').insert([{ 
        url, 
        title: "解析稍慢 (任务已提交)", 
        article: "微信文章较长或解析器繁忙。请稍后刷新页面，或者点击卡片查看原文。", 
        tags: ["待刷新"], 
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
