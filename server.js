const express = require('express');
const axios = require('axios');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://mdtxqfgzageqpmnsbalc.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_secret_tImX3ENgn-Ocw0dLe9MfXQ_qzxcv97V';
const supabase = createClient(supabaseUrl, supabaseKey);

// WhatsApp Cloud API Kredensial
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook Event Handler (POST) - Simpan pesan masuk ke Supabase
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const msg = body.entry[0].changes[0].value.messages[0];
      const from = msg.from;
      const text = msg.text ? msg.text.body : '[Media/Pesan Lain]';
      const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      try {
        await supabase.from('chats').insert([
          { phone: from, sender: 'customer', text: text, time: time }
        ]);
      } catch (err) {
        console.error('Gagal simpan ke Supabase:', err.message);
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Endpoint ambil histori obrolan
app.get('/api/chats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    const groupedChats = {};
    data.forEach(item => {
      if (!groupedChats[item.phone]) groupedChats[item.phone] = [];
      groupedChats[item.phone].push({
        id: item.id,
        sender: item.sender,
        text: item.text,
        time: item.time
      });
    });

    res.json(groupedChats);
  } catch (err) {
    res.status(500).json({});
  }
});

// Endpoint kirim pesan balasan
app.post('/api/send', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'Data tidak lengkap' });

  try {
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      }
    });

    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    await supabase.from('chats').insert([
      { phone: to, sender: 'agent', text: message, time: time }
    ]);

    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ error: 'Gagal kirim pesan' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
