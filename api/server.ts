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

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }, { apiVersion: 'v1' });
      
      const prompt = `
        You are a senior technical auditor. Evaluate the content complexity using the "Depth of Knowledge (DOK)" framework.

        ### LEVEL DEFINITION (1-5):
        - 1 (Recall): Basic facts, news alerts, or landing pages.
        - 2 (Skill/Concept): Introductory "How-to", listicles, or basic explanations.
        - 3 (Strategic Thinking): Standard professional articles, case studies, or common dev tasks.
        - 4 (Extended Thinking): Complex integration, architectural deep-dives (e.g., React migration), or advanced optimization.
        - 5 (Expert): Groundbreaking research papers, core source code analysis, or highly abstract logic.

        ### OUTPUT RULES:
        1. TAGS: Pick EXACTLY ONE from ["AI工具", "个人成长", "AI短剧", "VIBE CODING", "自媒体", "其他"].
        2. SUMMARY: Chinese, max 150 chars.
        3. LEVEL: Be objective based on the DOK framework.

        REQUIRED JSON FORMAT:
        {
          "title": "Title in Chinese",
          "article": "Full text in Chinese",
          "summary": "Concise summary in Chinese",
          "tags": ["Selected Tag"], 
          "level": 4
        }

        CONTENT:
        ${content.substring(0, 3500)}
      `;
      
      const result = await model.generateContent(prompt);
      const aiResponse = await result.response;
      const aiText = aiResponse.text();
      
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      const ai = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      // 强制数字解析逻辑
      let finalLevel = 3;
      if (ai && ai.level) {
        const num = parseInt(String(ai.level).replace(/\D/g, ''), 10);
        if (!isNaN(num)) finalLevel = num;
      }
      finalLevel = Math.min(Math.max(finalLevel, 1), 5);

      const { data, error } = await supabase.from('links').insert([{
        url: url,
        title: ai?.title || "Untitled",
        article: ai?.article || content.substring(0, 2000),
        summary: ai?.summary || "",
        tags: ai?.tags || ["其他"],
        level: [finalLevel]
      }]).select();

      if (error) throw error;

      const record = data[0];
      return res.status(200).json({
        ...record,
        summary: record.summary || record.article,
        displayLevel: finalLevel
      });

    } catch (err: any) {
      console.error(err);
      return res.status(200).json({ error: true, message: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase.from('links').select('*').order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err: any) {
      return res.status(200).json([]);
    }
  }
}
