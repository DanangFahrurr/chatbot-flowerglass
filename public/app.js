const API = "/api";
const history = [];

// Render produk
async function loadProducts() {
  try {
    // Kita arahkan ke folder public/data/
    const res = await fetch("/data/products.csv");
    if (!res.ok) throw new Error("File CSV tidak ditemukan");
    
    const text = await res.text();
    // Split by newline, tangani Windows (\r\n) dan Linux (\n)
    const lines = text.trim().split(/\r?\n/);
    
    // Ambil header (baris pertama)
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    
    // Parse baris data
    const products = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim());
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i] || "";
      });
      return obj;
    });

    const grid = document.getElementById("productsGrid");
    
    grid.innerHTML = products.map(p => {
      // Pastikan kita memanggil p.nama, p.harga, dll sesuai header CSV
      const harga = Number(p.harga);
      const formattedHarga = isNaN(harga) ? p.harga : new Intl.NumberFormat("id-ID", { 
        style: "currency", 
        currency: "IDR", 
        maximumFractionDigits: 0 
      }).format(harga);

      return `
        <div class="card">
          <h3>${p.nama || p.name || 'Tanpa Nama'}</h3>
          <span class="tag">${p.kategori || 'Umum'}</span>
          <p class="price">${formattedHarga}</p>
          <p class="desc">${p.deskripsi || '-'}</p>
        </div>
      `;
    }).join("");
    
  } catch (e) {
    console.error("Gagal load produk:", e);
    document.getElementById("productsGrid").innerHTML = `<p style="color:red;">Gagal memuat katalog produk.</p>`;
  }
}

// Chat logic
const chatToggle = document.getElementById("chatToggle");
const chatPanel = document.getElementById("chatPanel");
const chatClose = document.getElementById("chatClose");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

chatToggle.onclick = () => chatPanel.classList.toggle("hidden");
chatClose.onclick = () => chatPanel.classList.add("hidden");

function appendMessage(text, who) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  // Format bold dan enter
  div.innerHTML = text.replace(/\*(.+?)\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.onsubmit = async (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  
  appendMessage(msg, "user");
  chatInput.value = "";
  appendMessage("Mengetik...", "bot typing");

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, history })
    });
    const data = await res.json();
    
    // Hapus tulisan "Mengetik..."
    document.querySelector(".typing")?.remove();
    
    appendMessage(data.reply || "Maaf, terjadi kesalahan.", "bot");
    
    // Simpan history untuk konteks lanjutan
    history.push({ role: "user", content: msg });
    history.push({ role: "assistant", content: data.reply });
    if (history.length > 12) history.splice(0, 2);
    
  } catch (err) {
    document.querySelector(".typing")?.remove();
    appendMessage("Maaf, koneksi terganggu. Coba lagi.", "bot");
  }
};

// Jalankan saat halaman dimuat
loadProducts();