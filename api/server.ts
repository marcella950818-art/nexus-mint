import express from "express";
import { createServer as createViteServer } from "vite";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const db = new Database("nexus_mint.db");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT,
    url TEXT,
    summary TEXT,
    level INTEGER,
    tags TEXT,
    likes INTEGER,
    comments INTEGER,
    createdAt TEXT
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/cards", (req, res) => {
    const cards = db.prepare("SELECT * FROM cards ORDER BY createdAt DESC").all();
    const formattedCards = cards.map((c: any) => ({
      ...c,
      tags: JSON.parse(c.tags)
    }));
    res.json(formattedCards);
  });

  // Helper to extract data using Gemini and save to DB
  async function processAndSave(content: string, url: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `你是一个专业的数据提取助手。请分析以下文章内容：
      
      内容：
      ${content.substring(0, 15000)}
      
      任务：
      1. 提取文章标题 (title)
      2. 生成3句话的深度摘要 (summary)
      3. 评估难度等级 (level: 1-5)
      4. 从 [AI工具, 个人成长, AI短剧, Vibecoding, 自媒体, 其他] 中选择标签 (tags)
      5. 提取或估算总点赞数 (likes) 和 总评论数 (comments)。
      
      请严格返回 JSON 格式。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            level: { type: Type.INTEGER },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            likes: { type: Type.INTEGER },
            comments: { type: Type.INTEGER },
          },
          required: ["title", "summary", "level", "tags", "likes", "comments"]
        }
      }
    });

    const data = JSON.parse(response.text);
    const id = Math.random().toString(36).substring(7);
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO cards (id, title, url, summary, level, tags, likes, comments, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.title, url, data.summary, data.level, JSON.stringify(data.tags || ["其他"]), data.likes || 0, data.comments || 0, createdAt);

    return { id, ...data, url, createdAt };
  }

  // API: Ingest from URL (Standard flow)
  app.post("/api/ingest", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      const jinaResponse = await fetch(`https://r.jina.ai/${url}`);
      const content = await jinaResponse.text();
      const result = await processAndSave(content, url);
      res.json(result);
    } catch (error: any) {
      console.error("Ingest error:", error);
      res.status(500).json({ error: error.message || "录入失败" });
    }
  });

  // API: Ingest from Local content (Python script flow)
  app.post("/api/ingest-local", async (req, res) => {
    const { raw_content, original_url } = req.body;
    if (!raw_content || !original_url) {
      return res.status(400).json({ error: "raw_content and original_url are required" });
    }

    try {
      const result = await processAndSave(raw_content, original_url);
      res.json(result);
    } catch (error: any) {
      console.error("Local ingest error:", error);
      res.status(500).json({ error: error.message || "本地录入失败" });
    }
  });

  // Proxy to fetch article content (to avoid CORS)
  app.post("/api/fetch-article", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    try {
      const jinaResponse = await fetch(`https://r.jina.ai/${url}`);
      const text = await jinaResponse.text();
      res.json({ text });
    } catch (error) {
      console.error("Fetch error:", error);
      res.status(500).json({ error: "无法获取网页内容" });
    }
  });

  // Save structured card data
  app.post("/api/save-card", (req, res) => {
    const { title, url, summary, level, tags, likes, comments } = req.body;
    const id = Math.random().toString(36).substring(7);
    const createdAt = new Date().toISOString(); // Use full ISO string for precise sorting

    try {
      db.prepare(`
        INSERT INTO cards (id, title, url, summary, level, tags, likes, comments, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, title, url, summary, level, JSON.stringify(tags || ["其他"]), likes || 0, comments || 0, createdAt);
      res.json({ id, title, url, summary, level, tags, likes, comments, createdAt });
    } catch (error) {
      console.error("Save error:", error);
      res.status(500).json({ error: "保存失败" });
    }
  });

  // Seed data ONLY if the table is completely empty
  const count = (db.prepare("SELECT COUNT(*) as count FROM cards").get() as any).count;
  if (count === 0) {
    const { MOCK_CARDS } = await import("./src/constants");
    const insert = db.prepare(`
      INSERT INTO cards (id, title, url, summary, level, tags, likes, comments, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const card of MOCK_CARDS) {
      insert.run(card.id, card.title, card.url, card.summary, card.level, JSON.stringify(card.tags), card.likes, card.comments, card.createdAt);
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
