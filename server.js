const express = require('express');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===============================
// SUPABASE
// ===============================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL / SUPABASE_KEY belum diset');
}

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

// ===============================
// WHATSAPP CLOUD API
// ===============================

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN =
  process.env.ACCESS_TOKEN ||
  process.env.WHATSAPP_TOKEN;

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GRAPH_VERSION =
  process.env.GRAPH_VERSION || 'v19.0';

const GRAPH_URL =
  `https://graph.facebook.com/${GRAPH_VERSION}`;

// ===============================
// UPLOAD CONFIG
// ===============================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('File harus berupa gambar'));
    }

    cb(null, true);
  }
});

// ===============================
// WEBHOOK VERIFICATION
// ===============================

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// ===============================
// WEBHOOK MESSAGE
// ===============================

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (!body.object) {
    return res.sendStatus(404);
  }

  try {
    const message =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message) {
      const from = message.from;

      let text = '[Media/Pesan Lain]';

      if (message.text?.body) {
        text = message.text.body;
      } else if (message.image) {
        text = '📷 Gambar';
      } else if (message.video) {
        text = '🎥 Video';
      } else if (message.document) {
        text = '📄 Dokumen';
      } else if (message.audio) {
        text = '🎵 Audio';
      }

      const time = new Date().toLocaleTimeString(
        'id-ID',
        {
          hour: '2-digit',
          minute: '2-digit'
        }
      );

      await supabase
        .from('chats')
        .insert([
          {
            phone: from,
            sender: 'customer',
            text,
            time
          }
        ]);
    }

    res.sendStatus(200);

  } catch (error) {
    console.error(
      'Webhook error:',
      error.message
    );

    res.sendStatus(200);
  }
});

// ===============================
// GET CHATS
// ===============================

app.get('/api/chats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .order('id', {
        ascending: true
      });

    if (error) throw error;

    const groupedChats = {};

    data.forEach(item => {

      if (!groupedChats[item.phone]) {
        groupedChats[item.phone] = [];
      }

      groupedChats[item.phone].push({
        id: item.id,
        sender: item.sender,
        text: item.text,
        time: item.time
      });
    });

    res.json(groupedChats);

  } catch (error) {

    console.error(
      'Get chats error:',
      error.message
    );

    res.status(500).json({});
  }
});

// ===============================
// SEND TEXT
// ===============================

app.post('/api/send', async (req, res) => {

  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      error: 'Data tidak lengkap'
    });
  }

  try {

    const response = await axios.post(
      `${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`,

      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          body: message
        }
      },

      {
        headers: {
          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`,

          'Content-Type':
            'application/json'
        }
      }
    );

    const time =
      new Date().toLocaleTimeString(
        'id-ID',
        {
          hour: '2-digit',
          minute: '2-digit'
        }
      );

    await supabase
      .from('chats')
      .insert([
        {
          phone: to,
          sender: 'agent',
          text: message,
          time
        }
      ]);

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {

    console.error(
      'WhatsApp text error:',
      error.response?.data ||
      error.message
    );

    res.status(500).json({
      error: 'Gagal kirim pesan',
      details:
        error.response?.data?.error?.message ||
        error.message
    });
  }
});

// ===============================
// SEND IMAGE
// ===============================

app.post(
  '/api/send-image',
  upload.single('image'),
  async (req, res) => {

    try {

      const { to, caption } = req.body;

      if (!to) {
        return res.status(400).json({
          error: 'Nomor tujuan tidak ada'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'Gambar tidak ditemukan'
        });
      }

      // ==========================
      // 1. UPLOAD MEDIA KE WHATSAPP
      // ==========================

      const form = new FormData();

      form.append(
        'messaging_product',
        'whatsapp'
      );

      form.append(
        'file',
        req.file.buffer,
        {
          filename:
            req.file.originalname ||
            'image.jpg',

          contentType:
            req.file.mimetype
        }
      );

      const mediaResponse =
        await axios.post(

          `${GRAPH_URL}/${PHONE_NUMBER_ID}/media`,

          form,

          {
            headers: {
              Authorization:
                `Bearer ${WHATSAPP_TOKEN}`,

              ...form.getHeaders()
            },

            maxContentLength:
              Infinity,

            maxBodyLength:
              Infinity
          }
        );

      const mediaId =
        mediaResponse.data.id;

      if (!mediaId) {
        throw new Error(
          'WhatsApp tidak memberikan media ID'
        );
      }

      // ==========================
      // 2. KIRIM GAMBAR
      // ==========================

      const imageMessage = {
        messaging_product:
          'whatsapp',

        to,

        type:
          'image',

        image: {
          id: mediaId
        }
      };

      if (caption && caption.trim()) {
        imageMessage.image.caption =
          caption.trim();
      }

      const sendResponse =
        await axios.post(

          `${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`,

          imageMessage,

          {
            headers: {
              Authorization:
                `Bearer ${WHATSAPP_TOKEN}`,

              'Content-Type':
                'application/json'
            }
          }
        );

      // ==========================
      // 3. SIMPAN KE DATABASE
      // ==========================

      const time =
        new Date().toLocaleTimeString(
          'id-ID',
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        );

      let chatText = '📷 Gambar';

      if (caption && caption.trim()) {
        chatText =
          `📷 Gambar\n${caption.trim()}`;
      }

      await supabase
        .from('chats')
        .insert([
          {
            phone: to,
            sender: 'agent',
            text: chatText,
            time
          }
        ]);

      // ==========================
      // SUCCESS
      // ==========================

      res.json({
        success: true,
        media_id: mediaId,
        data: sendResponse.data
      });

    } catch (error) {

      console.error(
        'WhatsApp image error:',
        error.response?.data ||
        error.message
      );

      res.status(500).json({
        error: 'Gagal mengirim gambar',

        details:
          error.response?.data?.error?.message ||
          error.message
      });
    }
  }
);

// ===============================
// MULTER ERROR
// ===============================

app.use(
  (error, req, res, next) => {

    if (
      error instanceof multer.MulterError
    ) {

      return res.status(400).json({
        error:
          'Ukuran gambar terlalu besar atau upload bermasalah'
      });
    }

    if (error) {

      return res.status(400).json({
        error: error.message
      });
    }

    next();
  }
);

// ===============================
// SERVER
// ===============================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);

module.exports = app;
