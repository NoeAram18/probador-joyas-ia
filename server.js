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
    const rootPath = path.join(__dirname, 'index.html');
    const publicPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(rootPath)) return res.sendFile(rootPath);
    if (fs.existsSync(publicPath)) return res.sendFile(publicPath);
    res.send('Servidor activo. Archivo index.html no encontrado.');
});

app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    const userFile = req.file;
    const catalogPath = req.body.catalogPath; 
    const clientName = req.body.clientName;
    const clientId = Date.now();

    if (!userFile) return res.status(400).json({ success: false });

    try {
        // 1. ENVIAR FOTO DEL CLIENTE
        const form1 = new FormData();
        form1.append('chat_id', CHAT_ID);
        form1.append('photo', fs.createReadStream(userFile.path));
        form1.append('caption', `👤 **NUEVO PEDIDO**\nCliente: ${clientName}\n🆔 ID Cliente: ${clientId}`);

        const res1 = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form1, {
            headers: form1.getHeaders()
        });

        // 2. RESPONDER A LA WEB INMEDIATAMENTE
        // Esto quita el mensaje de "Procesando..." en la página
        res.json({ success: true, clientId: clientId });

        // 3. INTENTAR ENVIAR LA JOYA (En segundo plano)
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
        } catch (errImg) {
            // Si falla la imagen, mandamos solo el link para que no te quedes sin la info
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: `🔗 Link de la joya: ${catalogPath}`,
                reply_to_message_id: messageId
            });
        }

        // Limpiar archivo temporal
        if (fs.existsSync(userFile.path)) fs.unlinkSync(userFile.path);

    } catch (error) {
        console.error('Error:', error.message);
        if (!res.headersSent) res.status(500).json({ success: false });
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

app.listen(PORT, '0.0.0.0', () => console.log(`Puerto: ${PORT}`));
