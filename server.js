const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Configuración de multer para guardar fotos temporales
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    try {
        const userFile = req.file;
        const catalogPath = req.body.catalogPath; 

        if (!userFile || !catalogPath) {
            return res.status(400).json({ success: false, error: 'Faltan datos.' });
        }

        const fullCatalogPath = path.join(__dirname, 'public', catalogPath);

        // --- PASO 1: ENVIAR FOTO DEL CLIENTE ---
        const form1 = new FormData();
        form1.append('chat_id', CHAT_ID);
        form1.append('photo', fs.createReadStream(userFile.path));
        form1.append('caption', `👤 **NUEVO PEDIDO**\nEsta es la foto que subió el cliente.`);

        const res1 = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form1, {
            headers: form1.getHeaders()
        });

        // --- PASO 2: ENVIAR FOTO DEL CATÁLOGO ---
        // Usamos un pequeño retraso de 500ms para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 500));

        if (fs.existsSync(fullCatalogPath)) {
            const form2 = new FormData();
            form2.append('chat_id', CHAT_ID);
            form2.append('photo', fs.createReadStream(fullCatalogPath));
            form2.append('caption', `💍 **REFERENCIA SELECCIONADA**\nArchivo: ${path.basename(catalogPath)}`);
            form2.append('reply_to_message_id', res1.data.result.message_id); // Esto las "conecta" visualmente

            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form2, {
                headers: form2.getHeaders()
            });
        }

        // Limpieza
        fs.unlinkSync(userFile.path);
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error de Telegram:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: 'Error en el proceso de envío' });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor listo en puerto ${PORT}`));

