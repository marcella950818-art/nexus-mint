import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default async function (req: any, res: any) {
  // 设置跨域头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { url } = req.body;
    try {
      // 1. 模拟 iPhone 微信浏览器直接抓取 (避开 Jina，直接请求)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.42 NetType/WIFI',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const html = await response.text();

      // 2. 核心：提取微信静态标签 (即便正文被封，这些标签也一定在)
      const metaTitle = html.match(/property="og:title" content="([\s\S]*?)"/)?.[1] || 
                        html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
      const metaDesc = html.match(/property="og:description" content="([\s\S]*?)"/)?.[1] || "";

      // 3. 让 Gemini 根据元数据脑补出 Article 内容
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `你是一个知识萃取专家。
      我已经抓取到了这个网页的元数据：
      - 标题: ${metaTitle}
      - 摘要: ${metaDesc}
      - URL: ${url}

      请执行以下任务：
      1. 如果标题不全，请根据描述补全。
      2. 将摘要扩充为一段 200 字左右的连贯正文（Article），要求逻辑通顺，像原文章的一部分。
      3. 提取 3 个相关的短标签。
      
      必须只返回 JSON 格式：{"title": "", "article": "", "tags": []}`;

      const result = await model.generateContent(prompt);
      const aiResponse = result.response.text();
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const ai = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: metaTitle, article: metaDesc, tags: ["微信"] };

      // 4. 存入数据库
      const { data, error } = await supabase.from('links').insert([{
        url,
        title: ai.title || metaTitle || "解析完成",
        article: ai.article || metaDesc || "内容已存入，请点击原文查看",
        tags: Array.isArray(ai.tags) ? ai.tags : ["自动分类"],
        level: [3]
      }]).select();

      if (error) throw error;
      return res.status(200).json(data[0]);

    } catch (err: any) {
      console.error("Fetch Error:", err.message);
      // 最终兜底插入
      const { data } = await supabase.from('links').insert([{ 
        url, title: "点击查看原文", article: "外部解析受限", tags: ["待处理"], level: [3] 
      }]).select();
      return res.status(200).json(data ? data[0] : { success: true });
    }
  }

  if (req.method === 'GET') {
    const { data } = await supabase.from('links').select('*').order('id', { ascending: false });
    return res.status(200).json(data || []);
  }
}
