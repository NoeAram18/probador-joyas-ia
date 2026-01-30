const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose'); // IMPORTANTE: Esto faltaba arriba

const app = express();
const PORT = process.env.PORT || 10000;

// Configuración DB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Conectado a MongoDB"))
    .catch(err => console.error("❌ Error DB:", err));

// Esquema con Galería (Array de imágenes)
const ProductoSchema = new mongoose.Schema({
    nombre: String,
    categoria: String,
    precioBase: Number,
    imagenes: [String], 
    stock: { type: Boolean, default: true }
});
const Producto = mongoose.model('Producto', ProductoSchema);

const VentaSchema = new mongoose.Schema({
    cliente: String,
    joya: String,
    fecha: { type: Date, default: Date.now }
});
const Venta = mongoose.model('Venta', VentaSchema);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
let buzónEdiciones = {};

// --- RUTAS ---

app.get('/api/productos', async (req, res) => {
    try {
        const productos = await Producto.find({ stock: true });
        res.json(productos);
    } catch (err) { res.status(500).json([]); }
});

app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    const { catalogPath, clientName, joyaNombre } = req.body;
    const clientId = Date.now();
    res.json({ success: true, clientId });

    try {
        await Venta.create({ cliente: clientName, joya: joyaNombre });

        // Descargar la joya del catálogo para enviarla como archivo
        const responseImg = await axios.get(catalogPath, { responseType: 'arraybuffer' });
        
        const mediaGroup = [
            {
                type: 'photo',
                media: 'attach://userPhoto',
                caption: `👤 **NUEVO PEDIDO**\nCliente: ${clientName}\n💍 Joya: ${joyaNombre}\n🆔 ID: ${clientId}`
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
        formData.append('catalogPhoto', Buffer.from(responseImg.data), { filename: 'joya.jpg' });

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMediaGroup`, formData, {
            headers: formData.getHeaders()
        });

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (error) { console.error("Error Telegram:", error.message); }
});

// Rutas Admin protegidas
const authAdmin = (req, res, next) => {
    if (req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD) next();
    else res.status(401).json({ error: "Unauthorized" });
};

app.post('/api/admin/productos', authAdmin, async (req, res) => {
    const nuevo = await Producto.create(req.body);
    res.json(nuevo);
});

app.patch('/api/admin/productos/:id', authAdmin, async (req, res) => {
    const prod = await Producto.findByIdAndUpdate(req.params.id, { stock: req.body.stock }, { new: true });
    res.json(prod);
});

app.get('/api/admin/ventas', authAdmin, async (req, res) => {
    const ventas = await Venta.find().sort({ fecha: -1 });
    res.json(ventas);
});

app.post('/telegram-webhook', async (req, res) => {
    const msg = req.body.message;
    if (msg?.reply_to_message && msg?.photo) {
        const text = msg.reply_to_message.caption || "";
        const match = text.match(/ID: (\d+)/);
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
