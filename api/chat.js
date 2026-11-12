// api/chat.js
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Load CSV sekali saat cold start
function loadProducts() {
  const csvPath = path.join(process.cwd(), "data", "products.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ""; });
    return row;
  });
}

// RAG sederhana: scoring keyword
function buildContext(query, products) {
  const q = query.toLowerCase();
  const tokens = q.replace(/[^\w\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
  const scored = products.map(p => {
    const text = `${p.nama} ${p.kategori} ${p.deskripsi}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (text.includes(t)) score += 1;
      if (p.nama.toLowerCase().includes(t)) score += 3;
    }
    return { product: p, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);

  if (scored.length === 0) return "";
  const rows = scored.map(x => {
    const p = x.product;
    const harga = Number(p.harga).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
    return `• ${p.nama} - ${harga}\n  ${p.deskripsi}`;
  });
  return `Katalog Flowerglass relevan:\n${rows.join("\n")}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, history = [] } = req.body;
    const products = loadProducts();
    const ragContext = buildContext(message, products);

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

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "qwen/qwen3-32b",
      messages,
      max_tokens: 800
    });

    const reply = completion.choices[0]?.message?.content || "Maaf, saya belum bisa menjawab.";
    res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chatbot error: " + err.message });
  }
}