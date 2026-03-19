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
      // --- 关键改变：放弃所有公共代理，改用 Firecrawl 通用代理 (最稳的全文抓取) ---
      // 这是无需 Key 的试用模式，如果抓取量大可能需要免费 Key。它会返回 Markdown 格式的【全文正文】。
      const firecrawlUrl = `https://api.firecrawl.dev/v0/scrape?url=${encodeURIComponent(url)}`;
      const response = await fetch(firecrawlUrl);
      const data = await response.json();
      
      // Firecrawl 直接返回干净的 Markdown 全文
      const fullMarkdown = data.data?.markdown || "";

      if (fullMarkdown.length < 500) {
        // 如果抓取到的全文太短，说明被拦截了，启用保底 Meta 抓取逻辑
        const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        const proxyData = await proxyRes.json();
        const html = proxyData.contents;
        const metaTitle = html.match(/property="og:title" content="([\s\S]*?)"/)?.[1] || "";
        const metaDesc = html.match(/property="og:description" content="([\s\S]*?)"/)?.[1] || "";
        throw new Error(`仅拿到 Meta 信息: ${metaTitle}, ${metaDesc}`);
      }

      // --- 调用 AI 处理 Firecrawl 拿到的 Markdown 全文 ---
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `你是一个文章解析和格式化助手。
      这是一个网页的完整 Markdown 正文内容：
      
      ${fullMarkdown.substring(0, 15000)} // 读取 1.5 万字全文

      请任务：
      1. 必须从全文中提取出【准确标题】。
      2. 必须保留原文章节和段落结构，整理出最适合阅读的【完整正文】(article)。请忽略广告和导航栏。
      3. 生成 3 个标签。
      
      必须返回 JSON 格式：{"title":"","article":"","tags":[]}`;

      const result = await model.generateContent(prompt);
      const ai = JSON.parse(result.response.text().match(/\{[\s\S]*\}/)![0]);

      // --- 写入数据库 ---
      const { data: dbData, error } = await supabase.from('links').insert([{
        url,
        title: ai.title || "微信文章",
        article: ai.article || fullMarkdown || "未能完全提取到正文", // 这里存入原汁原味的全文
        tags: ai.tags || ["微信全量"],
        level: [3]
      }]).select();

      if (error) throw error;
      return res.status(200).json(dbData[0]);

    } catch (err: any) {
      console.error("DEBUG Final Error:", err.message);
      // 如果报错，说明 Meta 抓取也挂了或者全文模式被限流，存入保底数据，避免白屏
      const { data } = await supabase.from('links').insert([{ 
        url, title: "微信文章(请稍后)", article: err.message, tags: ["待补全"], level: [3] 
      }]).select();
      return res.status(200).json(data ? data[0] : { success: true });
    }
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return res.status(200).json(data || []);
  }
}
