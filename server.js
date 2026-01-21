const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// 1. CREACIÓN AUTOMÁTICA DE LA CARPETA UPLOADS
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log("✅ Carpeta 'uploads' creada");
}

// 2. CONFIGURACIÓN DE ALMACENAMIENTO TEMPORAL
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.json());

// 3. CONEXIÓN CON GOOGLE DRIVE
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function uploadToDrive(file) {
    try {
        // Carga de credenciales desde la Variable de Entorno
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        
        const auth = new google.auth.JWT(
            credentials.client_email,
            null,
            credentials.private_key,
            SCOPES
        );

        const drive = google.drive({ version: 'v3', auth });

        const fileMetadata = {
            name: file.filename,
            parents: ['1EYcfC0mvvB8YcqOvRbcayEzeXrNohv7D'] // <-- REEMPLAZA ESTO
        };

        const media = {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path)
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });

        // Borrar archivo temporal después de subirlo
        fs.unlinkSync(file.path);
        return response.data.id;
    } catch (error) {
        console.error("❌ Error en Drive:", error.message);
        throw error;
    }
}

// 4. RUTA PARA RECIBIR LA IMAGEN
// Debe decir '/upload-to-drive' para que coincida con tu index.html
app.post('/upload-to-drive', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No se subió ninguna imagen.');
        }
        console.log("📂 Imagen recibida para Drive:", req.file.filename);
        
        const driveId = await uploadToDrive(req.file);
        console.log("🚀 Éxito en Drive. ID:", driveId);
        
        // Enviamos el ID para que el index.html pueda trabajar con él
        res.json({ success: true, fileName: req.file.filename, driveId: driveId });
    } catch (error) {
        console.error("❌ Error en el proceso:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});



