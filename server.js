const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000;

// Conexión DB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Conectado a MongoDB"))
    .catch(err => console.error("❌ Error DB:", err));

// Modelos
const Producto = mongoose.model('Producto', new mongoose.Schema({
    nombre: String,
    categoria: String,
    precioBase: Number,
    imagenes: [String], 
    stock: { type: Boolean, default: true }
}));

const Venta = mongoose.model('Venta', new mongoose.Schema({
    cliente: String,
    joya: String,
    fecha: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(__dirname));
const upload = multer({ dest: 'uploads/' });

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
let buzónEdiciones = {};

// --- RUTAS CLIENTE ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

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
        const responseImg = await axios.get(catalogPath, { responseType: 'arraybuffer' });
        
        const mediaGroup = [
            { type: 'photo', media: 'attach://uPhoto', caption: `👤 PEDIDO: ${clientName}\n💍 Joya: ${joyaNombre}\n🆔 ID: ${clientId}` },
            { type: 'photo', media: 'attach://cPhoto' }
        ];

        const fd = new FormData();
        fd.append('chat_id', CHAT_ID);
        fd.append('media', JSON.stringify(mediaGroup));
        fd.append('uPhoto', fs.createReadStream(req.file.path));
        fd.append('cPhoto', Buffer.from(responseImg.data), { filename: 'joya.jpg' });

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMediaGroup`, fd, { headers: fd.getHeaders() });
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (e) { console.error("Error Telegram:", e.message); }
});

// --- RUTAS ADMIN (SIN CONTRASEÑA PARA DISEÑO) ---

app.get('/api/admin/productos-todos', async (req, res) => {
    const p = await Producto.find().sort({ _id: -1 });
    res.json(p);
});

app.post('/api/admin/productos', async (req, res) => {
    const p = await Producto.create(req.body);
    res.json(p);
});

app.patch('/api/admin/productos/:id', async (req, res) => {
    const p = await Producto.findByIdAndUpdate(req.params.id, { stock: req.body.stock }, { new: true });
    res.json(p);
});

app.delete('/api/admin/productos/:id', async (req, res) => {
    await Producto.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/check-edition/:clientId', (req, res) => {
    res.json({ ready: !!buzónEdiciones[req.params.clientId], url: buzónEdiciones[req.params.clientId] });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));
