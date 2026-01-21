const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path'); // Para manejar rutas de archivos de forma segura

const app = express();
const PORT = process.env.PORT || 8080;

const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
// Nueva variable para obtener la URL de tu app en Koyeb
const KOYEB_APP_URL = process.env.KOYEB_APP_URL || `http://localhost:${PORT}`; 

app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    try {
        const userFile = req.file;
        const catalogPath = req.body.catalogPath; // Ej: 'images/anillo1.jpg'

        if (!userFile || !catalogPath) {
            return res.status(400).json({ success: false, error: 'Faltan imágenes o datos' });
        }

        // 1. Descargamos la imagen del catálogo desde la URL pública de Koyeb
        const catalogImageUrl = `${KOYEB_APP_URL}/${catalogPath}`;
        const catalogImageResponse = await axios.get(catalogImageUrl, { responseType: 'stream' });

        // 2. Preparamos el FormData con ambas imágenes
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        
        // Creamos el array de medios para el grupo
        const media = [
            {
                type: 'photo',
                media: 'attach://userPhoto',
                caption: `👤 Foto del Cliente`
            },
            {
                type: 'photo',
                media: 'attach://catalogPhoto',
                caption: `💎 Joya del Catálogo: ${catalogPath.split('/').pop().split('.')[0]}` // Nombre del archivo sin extensión
            }
        ];

        form.append('media', JSON.stringify(media));
        form.append('userPhoto', fs.createReadStream(userFile.path));
        form.append('catalogPhoto', catalogImageResponse.data); // Usamos el stream descargado

        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMediaGroup`,
            form,
            { headers: form.getHeaders() }
        );

        // Limpieza de archivos temporales
        if (fs.existsSync(userFile.path)) fs.unlinkSync(userFile.path);

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error enviando grupo de fotos a Telegram:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message || 'Error al enviar a Telegram' });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));

