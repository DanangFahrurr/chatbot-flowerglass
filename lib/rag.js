const fs = require("fs");
const path = require("path");

class RAGEngine {
  constructor(csvPath, options = {}) {
    this.csvPath = csvPath || path.join(__dirname, "../data/products.csv");
    this.topK = options.topK || Number(process.env.RAG_TOP_K || 8);
    this.products = [];
    this.loadData();
  }

  loadData() {
    try {
      if (!fs.existsSync(this.csvPath)) {
        console.warn(` [RAG] File CSV tidak ditemukan di: ${this.csvPath}`);
        this.products = [];
        return;
      }
      const content = fs.readFileSync(this.csvPath, "utf-8");
      const lines = content.trim().split(/\r?\n/);
      if (lines.length < 2) {
        this.products = [];
        return;
      }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      this.products = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim());
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = cols[idx] || "";
        });
        return row;
      });
      console.log(` [RAG] Berhasil memuat ${this.products.length} produk dari CSV`);
    } catch (err) {
      console.error(" [RAG] Gagal memuat data CSV:", err);
      this.products = [];
    }
  }

  formatCurrency(numStr) {
    const num = Number(numStr);
    if (isNaN(num)) return numStr;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  // ============ DETEKSI SAPAAN ============
  isGreetingQuery(query) {
    if (!query) return false;
    const q = query.toLowerCase().trim();
    const greetings = [
      "halo", "hai", "hi", "hey", "hello", "hei", "p", "ping", "test",
      "pagi", "selamat pagi", "siang", "selamat siang", "sore", "selamat sore",
      "malam", "selamat malam", "assalamualaikum", "assalamu'alaikum",
      "assalamu alaikum", "permisi", "sampurasun"
    ];
    if (greetings.includes(q)) return true;

    if (/^(halo|hai|hi|hey|hello|hei|selamat\s+(pagi|siang|sore|malam)|assalamu\s*alaikum|permisi)\b/i.test(q)) {
      const productKeywords = [
        "produk", "harga", "katalog", "jual", "beli", "parfum", "scrub",
        "lotion", "sabun", "mist", "gift", "paket", "promo", "flowerglass"
      ];
      return !productKeywords.some(pk => q.includes(pk));
    }
    return false;
  }

  // ============ DETEKSI PERMINTAAN SEMUA KATALOG ============
  isAllProductsQuery(query) {
    if (!query) return false;
    const q = query.toLowerCase().trim();

    // Kalau menyebut kategori/produk spesifik → BUKAN all products
    const specificTerms = [
      "parfum", "scrub", "lotion", "sabun", "mist", "gift", "paket",
      "promo", "spons", "puff", "harga", "warna", "ukuran", "varian",
      "rekomendasi", "body", "care", "grooming", "aksesori"
    ];
    if (specificTerms.some(term => q.includes(term))) return false;

    const allPatterns = [
      /^semua(\s+produk(nya)?)?$/,
      /^(apa|ada)\s+(aja|saja)(\s+produk(nya)?)?$/,
      /^produk\s+(apa|ada)\s+(aja|saja)$/,
      /^katalog(\s+produk)?$/,
      /^daftar\s+produk$/,
      /^list\s+produk$/,
      /^koleksi(\s+lengkap)?$/,
      /^semuanya$/,
      /^jelasin\s+produk(nya)?$/,
      /^daftar\s+harga$/
    ];
    return allPatterns.some(p => p.test(q)) || q === "semua produk" || q === "katalog lengkap";
  }

  // ============ SEARCH (RAG CORE) ============
  search(query, k = this.topK) {
    if (!query || this.products.length === 0) return [];
    const normalized = query.toLowerCase().trim();

    // 1. Skip sapaan murni
    if (this.isGreetingQuery(normalized)) return [];

    // 2. Permintaan semua katalog
    if (this.isAllProductsQuery(normalized)) return this.products;

    // 3. Deteksi kategori via alias
    const categoryAliases = {
      "parfum": "parfum",
      "perfume": "parfum",
      "wangi": "parfum",
      "aroma": "parfum",
      "extrait": "parfum",
      "eau de": "parfum",
      "mist": "grooming",
      "hair mist": "grooming",
      "body mist": "grooming",
      "grooming": "grooming",
      "scrub": "body care",
      "lotion": "body care",
      "sabun": "body care",
      "wash": "body care",
      "soap": "body care",
      "kojic": "body care",
      "body care": "body care",
      "perawatan": "body care",
      "brightening": "body care",
      "whitening": "body care",
      "gift": "paket",
      "bundling": "paket",
      "promo": "paket",
      "paket": "paket",
      "hemat": "paket",
      "set": "paket",
      "spons": "aksesori",
      "puff": "aksesori",
      "shower": "aksesori",
      "aksesori": "aksesori"
    };

    let matchedCategory = null;
    for (const [alias, cat] of Object.entries(categoryAliases)) {
      if (normalized.includes(alias)) {
        matchedCategory = cat;
        break;
      }
    }

    // 4. Tokenisasi + filter stopword
    const stopwords = [
      "yang", "ada", "apa", "saja", "untuk", "dengan", "dari", "berapa",
      "saja", "dong", "kah", "sih", "nya", "itu", "ini", "dan", "atau",
      "bisa", "mau", "ingin", "minta", "tolong", "kak", "min"
    ];
    const queryTokens = normalized
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2 && !stopwords.includes(t));

    // 5. Filter kandidat berdasarkan kategori
    let candidateProducts = this.products;
    if (matchedCategory) {
      candidateProducts = this.products.filter(
        p => p.kategori && p.kategori.toLowerCase() === matchedCategory
      );
      if (candidateProducts.length === 0) candidateProducts = this.products;
    }

    if (queryTokens.length === 0 && !matchedCategory) return [];

    // 6. Scoring
    const scored = candidateProducts.map(p => {
      let score = 0;
      const nameLower = (p.nama || "").toLowerCase();
      const descLower = (p.deskripsi || "").toLowerCase();
      const catLower = (p.kategori || "").toLowerCase();

      for (const token of queryTokens) {
        if (nameLower.includes(token)) score += 10;
        if (catLower.includes(token)) score += 5;
        if (descLower.includes(token)) score += 3;
      }

      if (matchedCategory && catLower === matchedCategory) score += 4;

      return { product: p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

    if (scored.length > 0) return scored.slice(0, k).map(x => x.product);

    // 7. Fallback: kategori cocok, kembalikan semua di kategori itu
    if (matchedCategory && candidateProducts.length > 0) {
      return candidateProducts.slice(0, k);
    }

    return [];
  }

  // ============ LINK PRODUK ============
  getProductLink(product) {
    // Prioritas 1: link asli dari CSV (kalau ada kolom "link")
    if (product.link && product.link.startsWith("http")) return product.link;
    // Fallback: search lapak spesifik (shopid Flowerglass: 1320909828)
    const query = encodeURIComponent(product.nama);
    return `https://shopee.co.id/search?keyword=${query}&shopid=1320909828`;
  }

  // ============ BUILD CONTEXT UNTUK LLM ============
  buildContext(query) {
    const relevantProducts = this.search(query);
    if (!relevantProducts || relevantProducts.length === 0) return "";

    const grouped = {};
    for (const p of relevantProducts) {
      const cat = p.kategori || "Lainnya";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }

    let output = "Daftar Katalog Produk Flowerglass Official Store:\n";
    const wantLink = /\border\b|\bbeli\b|\blink\b|\bshopee\b|\bcek\b/i.test(query);

    for (const [category, items] of Object.entries(grouped)) {
      output += `\n[Kategori: ${category}]\n`;
      items.forEach(p => {
        const hargaFmt = this.formatCurrency(p.harga);
        output += `• ${p.nama} - Harga: ${hargaFmt}\n  Deskripsi: ${p.deskripsi}\n`;
        if (wantLink) {
          output += `  Link: ${this.getProductLink(p)}\n`;
        }
      });
    }

    // Link lapak resmi 1x saja di akhir (hemat token)
    output += `\nLink lapak resmi: https://shopee.co.id/flowerglass`;
    return output.trim();
  }
}

module.exports = RAGEngine;