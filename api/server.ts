import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 初始化 Supabase (确保 URL 和 Anon Key 正确)
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// 2. 初始化 Gemini (修正模型名称和 API Key)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function (req: any, res: any) {
  // 处理跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 处理 POST 请求 (解析 URL)
  if (req.method === 'POST') {
    const { url } = req.body;
    
    // 设置一个 9 秒的内部闹钟，防止 Vercel 10 秒硬限制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); 

    try {
      // 1. Firecrawl 抓取 (关键点：修正 API 路径和请求体)
      console.log(">>> 开始抓取:", url);
      const fcRes = await fetch(`https://api.firecrawl.dev/v1/scrape`, { // 试着改为 v1 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` 
        },
        body: JSON.stringify({ 
          url: url, // 这里直接传字符串
          pageOptions: { 
            onlyMainContent: true // 只要正文，提速
          }
        }),
        signal: controller.signal // 关联闹钟
      });

      // 关键：将 Firecrawl 的原始返回打印到日志
      const fcData = await fcRes.json();
      console.log(">>> Firecrawl 原始返回:", JSON.stringify(fcData).substring(0, 300));

      // 防御性检查：如果抓取失败，抛出 Firecrawl 的错误
      if (!fcData.success || !fcData.data) {
        throw new Error(`Firecrawl 抓取失败: ${fcData.error || '未知错误，请检查 API KEY'}`);
      }
      
      const content = fcData.data.markdown || fcData.data.content || "";
      if (content.length < 50) {
        throw new Error(`抓取内容太短 (${content.length}字)，可能被反爬或需登录`);
      }

      // 2. AI 处理 (关键点：修正模型名称和异步调用)
      console.log(">>> 开始 AI 处理...");
      // 使用更慷慨的免费层模型 models/gemini-1.5-flash
      const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
      
      const prompt = `Short summary in JSON:{"title":"","article":"","tags":[]}. Content: ${content.substring(0, 8000)}`;
      
      const result = await model.generateContent(prompt);
      
      // 核心修正：加 await 拿到真正的 response
      const response = await result.response; 
      const aiText = response.text(); // 这里拿到文字
      
      // 增强 JSON 提取逻辑
      const jsonStr = aiText.substring(aiText.indexOf('{'), aiText.lastIndexOf('}') + 1);
      const ai = JSON.parse(jsonStr);

      // 3. 写入数据库
      console.log(">>> 开始写入数据库...");
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: ai.title || "解析成功",
        article: ai.article || "摘要提取失败",
        tags: ai.tags || [],
        level: [3]
      }]).select();

      // 关掉闹钟
      clearTimeout(timeoutId);

      if (error) throw error;
      return res.status(200).json(data[0]);

    } catch (err: any) {
      console.error(">>> 捕获到错误:", err.message);
      
      // 关掉闹钟
      clearTimeout(timeoutId);

      // 容错：如果上面任何一步报错，存入保底数据，但在 article 里直接写明错误
      const { data } = await supabase.from('links').insert([{ 
        url, 
        title: "⚠️ 报错诊断报告", 
        article: `真凶定位: ${err.message}`, // 错误信息直接写在这里
        tags: ["DEBUG"], 
        level: [3] 
      }]).select();
      
      return res.status(200).json(data ? data[0] : { success: true });
    }
  }

  // 处理 GET 请求 (获取列表)
  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return res.status(200).json(data || []);
  }
}
