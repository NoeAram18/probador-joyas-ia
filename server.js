const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Configuración de subida para dos campos de archivo
const upload = multer({ dest: 'uploads/' });
const uploadFields = upload.fields([
    { name: 'userImage', maxCount: 1 },
    { name: 'catalogImage', maxCount: 1 }
]);

app.use(express.static('public'));
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// Cambia el endpoint en server.js por este:
app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    try {
        const userFile = req.file;
        const catalogPath = req.body.catalogPath; // Ejemplo: 'images/anillo1.jpg'

        if (!userFile || !catalogPath) {
            return res.status(400).json({ success: false, error: 'Faltan datos' });
        }

        // Extraemos solo el nombre del producto de la ruta para el mensaje
        const productName = catalogPath.split('/').pop().replace('.jpg', '').replace('.png', '');

        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        // Enviamos la foto del usuario
        form.append('photo', fs.createReadStream(userFile.path));
        // En el texto (caption) ponemos la referencia de la joya
        form.append('caption', `💎 **NUEVA SOLICITUD**\n\n👤 Foto del cliente adjunta.\n💍 Joya seleccionada: ${productName.toUpperCase()}`);

        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,
            form,
            { headers: form.getHeaders() }
        );

        // Borrar la foto temporal
        if (fs.existsSync(userFile.path)) fs.unlinkSync(userFile.path);

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error detallado:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));


