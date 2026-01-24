const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json());

let buzónEdiciones = {}; 

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    try {
        const userFile = req.file;
        const catalogPath = req.body.catalogPath;
        const clientName = req.body.clientName;
        const clientId = Date.now();

        const form1 = new FormData();
        form1.append('chat_id', CHAT_ID);
        form1.append('photo', fs.createReadStream(userFile.path));
        form1.append('caption', `👤 **NUEVO PEDIDO**\nCliente: ${clientName}\n🆔 ID Cliente: ${clientId}`);

        const res1 = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form1, {
            headers: form1.getHeaders()
        });

        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
                chat_id: CHAT_ID,
                photo: catalogPath,
                caption: `💍 **JOYA SELECCIONADA**\nRef: ${catalogPath}`,
                reply_to_message_id: res1.data.result.message_id
            });
        } catch (imgError) {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: `⚠️ Error imagen catálogo. Link: ${catalogPath}`,
                reply_to_message_id: res1.data.result.message_id
            });
        }

        if (fs.existsSync(userFile.path)) fs.unlinkSync(userFile.path);
        res.json({ success: true, clientId: clientId });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post('/telegram-webhook', async (req, res) => {
    const msg = req.body.message;
    if (msg && msg.reply_to_message && msg.photo) {
        const text = msg.reply_to_message.caption || "";
        const match = text.match(/ID Cliente: (\d+)/);
        if (match) {
            const clientId = match[1];
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const fileRes = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
            buzónEdiciones[clientId] = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileRes.data.result.file_path}`;
        }
    }
    res.sendStatus(200);
});

app.get('/check-edition/:clientId', (req, res) => {
    const id = req.params.clientId;
    res.json({ ready: !!buzónEdiciones[id], url: buzónEdiciones[id] || null });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor listo`));
