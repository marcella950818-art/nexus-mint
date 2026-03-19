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
    const timeoutId = setTimeout(() => controller.abort(), 9000); 

    try {
      // 1. Firecrawl 抓取 (适配最新 API 格式)
      const fcRes = await fetch(`https://api.firecrawl.dev/v1/scrape`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` 
        },
        body: JSON.stringify({ 
          url: url,
          formats: ["markdown"], // 新版必填字段
          onlyMainContent: true  // 提取正文
        }),
        signal: controller.signal
      });

      const fcData = await fcRes.json();
      
      if (!fcData.success) {
        throw new Error(`Firecrawl 报错: ${fcData.error || '请求被拒绝'}`);
      }

      const content = fcData.data?.markdown || "";
      if (content.length < 10) throw new Error("抓取内容为空");

      // 2. AI 处理 (确保异步流完整)
      const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
      const prompt = `你是一个网页总结助手。请阅读内容并严格返回 JSON 格式：{"title":"标题","article":"简短摘要","tags":["标签1"]}。内容如下：${content.substring(0, 6000)}`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const aiText = await response.text(); // 确保获取文本
      
      // 清洗 AI 可能带有的 Markdown 标签
      const jsonStr = aiText.replace(/```json|```/g, "").trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI 返回格式非 JSON");
      const ai = JSON.parse(jsonMatch[0]);

      // 3. 写入数据库
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: ai.title || "解析成功",
        article: ai.article || "无摘要内容",
        tags: ai.tags || ["自动处理"],
        level: [3]
      }]).select();

      clearTimeout(timeoutId);
      if (error) throw error;
      return res
