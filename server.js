const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose'); // Nueva librería para DB

const app = express();
const PORT = process.env.PORT || 10000;

// --- CONFIGURACIÓN DE MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Conectado a MongoDB"))
    .catch(err => console.error("❌ Error DB:", err));

// Definir cómo es un Producto
const ProductoSchema = new mongoose.Schema({
    nombre: String,
    categoria: String,
    precioBase: Number,
    urlImagen: String,
    stock: { type: Boolean, default: true }
});
const Producto = mongoose.model('Producto', ProductoSchema);

// Definir Registro de Ventas
const VentaSchema = new mongoose.Schema({
    cliente: String,
    joya: String,
    fecha: { type: Date, default: Date.now },
    status: { type: String, default: 'Pendiente' }
});
const Venta = mongoose.model('Venta', VentaSchema);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
let buzónEdiciones = {};

// --- RUTAS PARA EL CLIENTE ---

// Obtener catálogo desde la DB en lugar de código fijo
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
        // Guardar intento de venta en DB
        await Venta.create({ cliente: clientName, joya: joyaNombre });

        // Enviar a Telegram (mantenemos tu lógica que ya funciona)
        const form1 = new FormData();
        form1.append('chat_id', CHAT_ID);
        form1.append('photo', fs.createReadStream(req.file.path));
        form1.append('caption', `👤 **NUEVO PEDIDO**\nCliente: ${clientName}\n🆔 ID Cliente: ${clientId}\n💍 Joya: ${joyaNombre}`);

        const res1 = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form1, { headers: form1.getHeaders() });
        const messageId = res1.data.result.message_id;

        // Foto de catálogo
        const responseImg = await axios.get(catalogPath, { responseType: 'arraybuffer', timeout: 5000 });
        const form2 = new FormData();
        form2.append('chat_id', CHAT_ID);
        form2.append('photo', Buffer.from(responseImg.data), { filename: 'joya.jpg' });
        form2.append('reply_to_message_id', messageId);
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form2, { headers: form2.getHeaders() });

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (error) { console.error("Error proceso:", error); }
});

// --- RUTAS DE ADMINISTRADOR (NUEVO) ---

// Crear nuevo producto
app.post('/api/admin/productos', async (req, res) => {
    try {
        const nuevo = await Producto.create(req.body);
        res.json({ success: true, producto: nuevo });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Cambiar Stock (Agotar/Activar)
app.patch('/api/admin/productos/:id', async (req, res) => {
    try {
        const prod = await Producto.findByIdAndUpdate(req.params.id, { stock: req.body.stock }, { new: true });
        res.json(prod);
    } catch (err) { res.status(500).send(err); }
});

// Ver reporte de ventas
app.get('/api/admin/ventas', async (req, res) => {
    const ventas = await Venta.find().sort({ fecha: -1 });
    res.json(ventas);
});

// Webhook y CheckEdition se mantienen igual...
app.post('/telegram-webhook', async (req, res) => { /* Tu código actual */ });
app.get('/check-edition/:clientId', (req, res) => { /* Tu código actual */ });

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor Pro en puerto ${PORT}`));
