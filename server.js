// Simpan riwayat chat dalam memori berformat objek: { "62812345678": [ {sender: 'user', text: 'halo', time: '...'} ] }
let chatHistories = {};

// Endpoint untuk menerima webhook dari Meta (Pesan Masuk)
app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'whatsapp_business_account') {
    body.entry.forEach(entry => {
      entry.changes.forEach(change => {
        if (change.value.messages) {
          change.value.messages.forEach(msg => {
            const senderPhone = msg.from; // Nomor pengirim
            const messageText = msg.text ? msg.text.body : '[Media/Non-Teks]';
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Inisialisasi array jika nomor belum ada
            if (!chatHistories[senderPhone]) {
              chatHistories[senderPhone] = [];
            }

            // Masukkan pesan ke riwayat nomor tersebut
            chatHistories[senderPhone].push({
              sender: 'customer',
              text: messageText,
              time: timestamp
            });
          });
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Endpoint untuk mengambil semua daftar kontak dan chat
app.get('/api/chats', (req, res) => {
  res.json(chatHistories);
});

// Endpoint untuk mengirim pesan (Teks biasa / Balasan CS)
app.post('/api/send', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'Nomor dan pesan wajib diisi' });

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message }
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: data.error.message });

    // Simpan pesan keluar ke riwayat kontak tersebut
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!chatHistories[to]) chatHistories[to] = [];
    chatHistories[to].push({
      sender: 'agent',
      text: message,
      time: timestamp
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal kirim pesan' });
  }
});
