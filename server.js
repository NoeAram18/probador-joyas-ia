const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000; 

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

let buzónEdiciones = {}; 

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

app.get('/', (req, res) => {
    const paths = [path.join(__dirname, 'index.html'), path.join(__dirname, 'public', 'index.html')];
    const validPath = paths.find(p => fs.existsSync(p));
    validPath ? res.sendFile(validPath) : res.send('No se encontró index.html');
});

app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    const userFile = req.file;
    const catalogPath = req.body.catalogPath; 
    const clientName = req.body.clientName;
    const clientId = Date.now();

    if (!userFile) return res.status(400).json({ success: false });

    // --- CAMBIO CLAVE: RESPONDER A LA WEB DE INMEDIATO ---
    // Esto hace que el "Procesando..." desaparezca al instante en el navegador
    res.json({ success: true, clientId: clientId });

    // --- EL RESTO DEL PROCESO OCURRE EN "SEGUNDO PLANO" ---
    try {
        const form1 = new FormData();
        form1.append('chat_id', CHAT_ID);
        form1.append('photo', fs.createReadStream(userFile.path));
        form1.append('caption', `👤 **NUEVO PEDIDO**\nCliente: ${clientName}\n🆔 ID Cliente: ${clientId}`);

        const res1 = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form1, {
            headers: form1.getHeaders()
        });

        const messageId = res1.data.result.message_id;

        try {
            const responseImg = await axios.get(catalogPath, { responseType: 'arraybuffer', timeout: 5000 });
            const form2 = new FormData();
            form2.append('chat_id', CHAT_ID);
            form2.append('photo', Buffer.from(responseImg.data), { filename: 'joya.jpg' });
            form2.append('caption', `💍 **JOYA SELECCIONADA**`);
            form2.append('reply_to_message_id', messageId);

            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form2, {
                headers: form2.getHeaders()
            });
        } catch (errorJoya) {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: `🔗 Link de la joya: ${catalogPath}`,
                reply_to_message_id: messageId
            });
        }

        if (fs.existsSync(userFile.path)) fs.unlinkSync(userFile.path);

    } catch (errorGeneral) {
        console.error('Error en proceso Telegram:', errorGeneral.message);
    }
});

app.post('/telegram-webhook', async (req, res) => {
    const msg = req.body.message;
    if (msg?.reply_to_message && msg?.photo) {
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

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor activo`));
