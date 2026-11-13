import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, history = [] } = req.body;

    // 1. Cek API Key
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !apiKey.startsWith("gsk_")) {
      return res.status(500).json({ 
        reply: "⚠️ API Key Groq belum dikonfigurasi dengan benar di Environment Variables Vercel." 
      });
    }

    const groq = new Groq({ apiKey });

    // 2. Baca katalog produk (Path diperbaiki)
    const csvPath = path.join(process.cwd(), "public", "data", "products.csv");
    let products = [];
    try {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.trim().split(/\r?\n/);
      const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ''));
      products = lines.slice(1).map(line => {
        const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        const row = {};
        headers.forEach((h, i) => { 
          row[h] = (cols[i] || "").replace(/^"|"$/g, '').trim(); 
        });
        return row;
      });
    } catch (e) {
      console.warn("Gagal baca CSV di Vercel, pastikan file ada di public/data/", e.message);
    }

    // 3. Buat konteks RAG sederhana
    const q = message.toLowerCase();
    const tokens = q.replace(/[^\w\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
    
    let relevant = products.map(p => {
      const text = `${p.nama} ${p.kategori} ${p.deskripsi}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (text.includes(t)) score += 1;
        if (p.nama.toLowerCase().includes(t)) score += 3;
      }
      return { p, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);

    let ragContext = "";
    if (relevant.length > 0) {
      ragContext = "Katalog Produk Relevan:\n" + relevant.map(x => {
        const harga = Number(x.p.harga).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
        return `• ${x.p.nama} - ${harga}\n  ${x.p.deskripsi}`;
      }).join("\n");
    }

    // 4. Prompt Sistem
    const systemPrompt = `Anda adalah asisten Flowerglass Official Store, toko perawatan tubuh & parfum terpercaya.
Jawab ramah, natural, to-the-point dalam Bahasa Indonesia.
Jawab HANYA berdasarkan katalog di bawah. Jangan mengarang data.
Jika ditanya order/link, arahkan ke https://shopee.co.id/flowerglass
Gunakan format WhatsApp: *bold*, • bullet, emoji secukupnya.

${ragContext || "(Tidak ada katalog relevan. Jika hanya sapaan, balas ramah.)"}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6),
      { role: "user", content: message }
    ];


    const candidateModels = [
      "qwen/qwen3.8-27b"
    ];

    let reply = null;
    let lastError = null;

    for (const model of candidateModels) {
      try {
        const completion = await groq.chat.completions.create({
          model: model,
          messages: messages,
          max_tokens: 800,
          temperature: 0.5
        });
        reply = completion.choices[0]?.message?.content;
        if (reply) break;
      } catch (err) {
        console.warn(`Model ${model} gagal:`, err.message);
        lastError = err;
      }
    }

    if (!reply) {
      throw new Error(`Semua model Groq gagal. Error: ${lastError?.message}`);
    }

    res.status(200).json({ reply });

  } catch (err) {
    console.error("Fatal Error:", err);
    res.status(500).json({ 
      reply: "Maaf, sistem sedang sibuk. Cek log Vercel untuk detail error." 
    });
  }
}