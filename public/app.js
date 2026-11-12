const API = "/api";
const history = [];

// Render produk
async function loadProducts() {
  try {
    // Untuk Vercel: buat endpoint /api/products juga, atau embed CSV via fetch statis
    const res = await fetch("/data/products.csv");
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const products = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim());
      const obj = {};
      headers.forEach((h, i) => obj[h] = cols[i] || "");
      return obj;
    });
    const grid = document.getElementById("productsGrid");
    grid.innerHTML = products.map(p => {
      const harga = Number(p.harga).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
      return `<div class="card">
        <h3>${p.nama}</h3>
        <span class="tag">${p.kategori}</span>
        <p class="price">${harga}</p>
        <p class="desc">${p.deskripsi}</p>
      </div>`;
    }).join("");
  } catch (e) {
    console.error("Gagal load produk:", e);
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

loadProducts();