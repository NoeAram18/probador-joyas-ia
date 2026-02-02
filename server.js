const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// 1. CONEXIÓN A BASE DE DATOS (MongoDB)
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ GEDALIA DB: Conexión Exitosa"))
    .catch(err => console.error("❌ Error de Conexión DB:", err));

// ==========================================
// 2. MODELOS DE DATOS
// ==========================================
const ProductoSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    categoria: { type: String, enum: ['Anillos', 'Dije', 'Collares', 'Aretes', 'Pulseras'], required: true },
    precioBase: { type: Number, required: true },
    imagenes: [String], // Array para soportar hasta 3 URLs de fotos
    stock: { type: Boolean, default: true }
});
const Producto = mongoose.model('Producto', ProductoSchema);

const VentaSchema = new mongoose.Schema({
    cliente: String,
    joya: String,
    fecha: { type: Date, default: Date.now }
});
const Venta = mongoose.model('Venta', VentaSchema);

// ==========================================
// 3. MIDDLEWARES Y CONFIGURACIÓN
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Sirve index.html y admin.html desde la raíz

const upload = multer({ dest: 'uploads/' });

// Variables de Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
let buzónEdiciones = {}; // Memoria temporal para montajes editados

// ==========================================
// 4. RUTAS DE NAVEGACIÓN (Frontend)
// ==========================================

// Ruta principal - Resuelve el error "Cannot GET /"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Ruta de administración
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================================
// 5. API PARA CLIENTES (Tienda)
// ==========================================

// Obtener productos activos
app.get('/api/productos', async (req, res) => {
    try {
        const productos = await Producto.find({ stock: true });
        res.json(productos);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener catálogo" });
    }
});

// Envío Premium a Telegram (Álbum de fotos)
app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    const { catalogPath, clientName, joyaNombre } = req.body;
    const clientId = Date.now();
    
    // Respondemos de inmediato al cliente para mejorar la experiencia
    res.json({ success: true, clientId });

    try {
        // Guardar registro de interés en la DB
        await Venta.create({ cliente: clientName, joya: joyaNombre });

        // Descargar la imagen del catálogo para enviarla como archivo real
        const responseImg = await axios.get(catalogPath, { responseType: 'arraybuffer' });
        
        // Configurar el álbum (Media Group)
        const mediaGroup = [
            { 
                type: 'photo', 
                media: 'attach://userPhoto', 
                caption: `💎 **NUEVA SOLICITUD GEDALIA**\n\n👤 **Cliente:** ${clientName}\n💍 **Pieza:** ${joyaNombre}\n🆔 **ID Seguimiento:** ${clientId}\n\n📝 *Instrucción:* Realiza el montaje y responde a este mensaje con la imagen editada.` 
            },
            { 
                type: 'photo', 
                media: 'attach://catalogPhoto' 
            }
        ];

        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('media', JSON.stringify(mediaGroup));
        formData.append('userPhoto', fs.createReadStream(req.file.path));
        formData.append('catalogPhoto', Buffer.from(responseImg.data), { filename: 'joya_premium.jpg' });

        // Enviar a Telegram
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMediaGroup`, formData, {
            headers: formData.getHeaders()
        });

        // Limpieza de archivo temporal
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    } catch (error) {
        console.error("❌ Error en flujo Telegram:", error.message);
    }
});

// ==========================================
// 6. API ADMINISTRATIVA (Gestión)
// ==========================================

// Obtener todos (incluyendo agotados)
app.get('/api/admin/productos-todos', async (req, res) => {
    const productos = await Producto.find().sort({ _id: -1 });
    res.json(productos);
});

// Crear nueva pieza
app.post('/api/admin/productos', async (req, res) => {
    try {
        const nuevo = await Producto.create(req.body);
        res.json(nuevo);
    } catch (err) {
        res.status(400).json({ error: "Datos inválidos" });
    }
});

// Alternar Stock (Disponible/Agotado)
app.patch('/api/admin/productos/:id', async (req, res) => {
    const p = await Producto.findByIdAndUpdate(
        req.params.id, 
        { stock: req.body.stock }, 
        { new: true }
    );
    res.json(p);
});

// Eliminar pieza
app.delete('/api/admin/productos/:id', async (req, res) => {
    await Producto.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ==========================================
// 7. SISTEMA DE RESPUESTA (Webhook)
// ==========================================

app.post('/telegram-webhook', async (req, res) => {
    const msg = req.body.message;
    if (msg?.reply_to_message && msg?.photo) {
        const match = (msg.reply_to_message.caption || "").match(/ID Seguimiento: (\d+)/);
        if (match) {
            const clientId = match[1];
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            
            const fileRes = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
            const fullPath = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileRes.data.result.file_path}`;
            
            buzónEdiciones[clientId] = fullPath;
            console.log(`✅ Edición lista para cliente ${clientId}`);
        }
    }
    res.sendStatus(200);
});

app.get('/check-edition/:clientId', (req, res) => {
    const id = req.params.clientId;
    res.json({ ready: !!buzónEdiciones[id], url: buzónEdiciones[id] || null });
});

// ==========================================
// 8. LANZAMIENTO
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    -------------------------------------------
    🚀 GEDALIA SERVER IS LIVE
    📍 Port: ${PORT}
    🛠 Mode: Development (No Password)
    -------------------------------------------
    `);
});
