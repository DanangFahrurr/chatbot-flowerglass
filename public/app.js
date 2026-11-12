// Load PapaParse dari CDN secara otomatis
const script = document.createElement('script');
script.src = "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js";
script.onload = () => loadProducts();
document.head.appendChild(script);

const API = "/api";
const history = [];

async function loadProducts() {
  try {
    const grid = document.getElementById("productsGrid");
    grid.innerHTML = "<p>Memuat katalog...</p>";

    Papa.parse("/data/products.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        const products = results.data;
        
        if (products.length === 0) {
          grid.innerHTML = "<p>Tidak ada produk.</p>";
          return;
        }

        grid.innerHTML = products.map(p => {
          const nama = p.nama || "Tanpa Nama";
          const kategori = p.kategori || "Umum";
          const gambar = p.gambar || "https://via.placeholder.com/200x200?text=No+Image";
          
          const rawHarga = p.harga || "0";
          const hargaNum = Number(rawHarga.toString().replace(/[^0-9]/g, ''));
          const formattedHarga = isNaN(hargaNum) ? rawHarga : new Intl.NumberFormat("id-ID", { 
            style: "currency", currency: "IDR", maximumFractionDigits: 0 
          }).format(hargaNum);

          const deskripsi = p.deskripsi || "-";

          return `
            <div class="card">
              <img src="${gambar}" alt="${nama}" class="product-img" onerror="this.src='https://via.placeholder.com/200x200?text=No+Image'">
              <h3>${nama}</h3>
              <span class="tag">${kategori}</span>
              <p class="price">${formattedHarga}</p>
              <p class="desc">${deskripsi}</p>
            </div>
          `;
        }).join("");
      },
      error: function(err) {
        grid.innerHTML = `<p style="color:red;">Gagal memuat katalog: ${err.message}</p>`;
      }
    });
  } catch (e) {
    console.error("Gagal load produk:", e);
  }
}

// --- CHAT LOGIC ---
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
    
    document.querySelector(".typing")?.remove();
    appendMessage(data.reply || "Maaf, terjadi kesalahan.", "bot");
    
    history.push({ role: "user", content: msg });
    history.push({ role: "assistant", content: data.reply });
    if (history.length > 12) history.splice(0, 2);
    
  } catch (err) {
    document.querySelector(".typing")?.remove();
    appendMessage("Maaf, koneksi terganggu. Coba lagi.", "bot");
  }
};