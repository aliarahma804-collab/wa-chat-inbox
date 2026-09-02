const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "token_rahasia_bebas_123";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

let messagesList = [];

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object) {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message) {
      messagesList.push({
        id: message.id,
        from: message.from,
        text: message.text ? message.text.body : '[Media/Pesan Non-Teks]',
        direction: 'in',
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      });
    }
    return res.sendStatus(200);
  }
  return res.sendStatus(404);
});

app.get('/api/messages', (req, res) => {
  res.json(messagesList);
});

app.post('/api/send', async (req, res) => {
  const { to, text } = req.body;

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    messagesList.push({
      id: response.data.messages?.[0]?.id || Date.now().toString(),
      from: to,
      text: text,
      direction: 'out',
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    res.status(500).json({ success: false, error: errorData });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server aktif di port ${PORT}`));
