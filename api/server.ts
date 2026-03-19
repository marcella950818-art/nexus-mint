import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function (req: any, res: any) {
  // 基础跨域设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 处理 POST 请求：录入新链接
  if (req.method === 'POST') {
    const { url } = req.body;
    try {
      // 1. 使用 Firecrawl 抓取网页内容
      const fcRes = await fetch(`https://api.firecrawl.dev/v1/scrape`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` 
        },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true })
      });
      const fcData = await fcRes.json();
      const content = fcData.data?.markdown || "No content found";

      // 2. 使用 Gemini 2.5 生成内容
      // 逻辑：同一次请求生成“详细原文”和“精简摘要”，节省 Vercel 时间
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }, { apiVersion: 'v1' });
      
      const prompt = `
        你是一个专业的网页内容分析专家。请根据提供的网页内容，严格按以下 JSON 格式返回结果：
        {
          "title": "网页的原始标题",
          "article": "网页的核心正文内容，请保持详细，用于存档",
          "summary": "请将网页内容总结为一段 150 字以内的精华摘要，用于卡片展示",
          "tags": ["标签1", "标签2", "标签3"],
          "level": 3
        }

        网页内容如下：
        ${content.substring(0, 3500)}
      `;
      
      const result = await model.generateContent(prompt);
      const aiResponse = await result.response;
      const aiText = aiResponse.text();
      
      // 正则匹配提取 JSON 部分，防止 AI 吐出多余的 Markdown 标记
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      const ai = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        title: "解析失败", 
        article: content.substring(0, 2000), 
        summary: "摘要生成失败",
        tags: ["未分类"],
        level: 3 
      };

      // 3. 写入 Supabase 数据库
      const { data, error } = await supabase.from('links').insert([{
        url: url,
        title: ai.title || "Untitled",
        article: ai.article || "", // 详细存档
        summary: ai.summary || "", // 精简摘要
        tags: ai.tags || [],
        level: [ai.level || 3]
      }]).select();

      if (error) throw error;

      // 4. 返回给前端（全兼容模式）
      const record = data[0];
      return res.status(200).json({
        ...record,
        // 冗余字段确保前端 DetailPanel 无论读取哪个字段都能显示
        summary: record.summary || record.article, 
        displayLevel: Array.isArray(record.level) ? record.level[0] : 3
      });

    } catch (err: any) {
      console.error("Server Error:", err);
      return res.status(200).json({ error: true, message: err.message });
    }
  }

  // 处理 GET 请求：获取所有卡片列表
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('links')
        .select('*')
        .order('id', { ascending: false });
      
      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err: any) {
      return res.status(200).json([]);
    }
  }
}
