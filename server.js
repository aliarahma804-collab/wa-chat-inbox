import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let chatHistories = {};

// Webhook Verification Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Terima Pesan Masuk
app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'whatsapp_business_account') {
    body.entry?.forEach(entry => {
      entry.changes?.forEach(change => {
        if (change.value?.messages) {
          change.value.messages.forEach(msg => {
            const senderPhone = msg.from;
            const messageText = msg.text ? msg.text.body : '[Media/Pesan Non-Teks]';
            const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

            if (!chatHistories[senderPhone]) {
              chatHistories[senderPhone] = [];
            }

            chatHistories[senderPhone].push({
              sender: 'customer',
              text: messageText,
              time: timestamp
            });
          });
        }
      });
    });
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
});

// Ambil Daftar Chat
app.get('/api/chats', (req, res) => {
  res.json(chatHistories);
});

// Kirim Pesan Teks
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
    if (!response.ok) return res.status(400).json({ error: data.error?.message || 'Gagal kirim' });

    const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    if (!chatHistories[to]) chatHistories[to] = [];
    chatHistories[to].push({
      sender: 'agent',
      text: message,
      time: timestamp
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
