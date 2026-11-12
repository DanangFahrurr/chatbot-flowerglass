// ===== ENDPOINT CHATBOT PUBLIK (untuk website Vercel) =====
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    }
    const reply = await getAIResponse(sessionId || "web-visitor", message);
    res.json({ reply });
  } catch (err) {
    console.error("Error /api/chat:", err);
    res.status(500).json({ error: "Terjadi kesalahan pada server" });
  }
});

const systemPrompt = `Anda adalah konsultan resmi dari "Flowerglass Official Store", 
toko perawatan tubuh dan parfum terpercaya. Jawab dalam Bahasa Indonesia yang ramah, 
hangat, natural, to-the-point, dan rapi.

PRINSIP KEAKURATAN DATA PRODUK:
1. Jawab HANYA berdasarkan konteks katalog di bawah.
2. JANGAN mengarang spesifikasi, varian, atau bahan yang tidak ada di katalog.
3. Jika pelanggan tanya produk di luar katalog atau ingin order, arahkan ke lapak resmi:
   https://shopee.co.id/flowerglass
4. Gunakan format WhatsApp: *teks* untuk bold, • untuk bullet, emoji secukupnya (🌸, ✨, 🛍️).
5. Jangan sebut istilah internal seperti "file CSV" atau "katalog sistem".

${ragContext ? ragContext : "(Tidak ada katalog relevan. Jika hanya sapaan, balas dengan ramah.)"}`;