const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// 1. CONEXIÓN A BASE DE DATOS
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ GEDALIA DB: Conexión Exitosa"))
    .catch(err => console.error("❌ Error DB:", err));

// ==========================================
// 2. MODELOS DE DATOS
// ==========================================
const ProductoSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    categoria: { type: String, required: true },
    precioBase: { type: Number, required: true },
    imagenes: [String],
    vistas: { type: Number, default: 0 },
    stock: { type: Boolean, default: true },
    descuento: { type: Number, default: 0 },
    envioGratis: { type: Boolean, default: false }
});
const Producto = mongoose.model('Producto', ProductoSchema);

const PedidoSchema = new mongoose.Schema({
    cliente: String,
    joya: String,
    monto: Number,
    fecha: { type: Date, default: Date.now }
});
const Pedido = mongoose.model('Pedido', PedidoSchema);

// ==========================================
// 3. CONFIGURACIÓN Y MIDDLEWARES
// ==========================================
app.use(express.json());
app.use(express.static(__dirname)); 
const upload = multer({ dest: 'uploads/' });

// Variables de Entorno (Configúralas en Render)
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ==========================================
// 4. RUTAS PARA LA TIENDA (CLIENTE)
// ==========================================

// Obtener catálogo para el index
app.get('/api/productos', async (req, res) => {
    try {
        const p = await Producto.find({ stock: true });
        res.json(p);
    } catch (e) { res.status(500).json([]); }
});

// Incrementar vistas al abrir el modal
app.post('/api/productos/view/:id', async (req, res) => {
    try {
        await Producto.findByIdAndUpdate(req.params.id, { $inc: { vistas: 1 } });
        res.sendStatus(200);
    } catch (e) { res.sendStatus(500); }
});

// ==========================================
// 5. RUTAS PARA ADMINISTRADOR
// ==========================================

// Subir imagen a ImgBB
app.post('/api/admin/upload-image', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).send("No hay imagen");

    try {
        const form = new FormData();
        form.append('image', fs.createReadStream(req.file.path));
        
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form, {
            headers: form.getHeaders()
        });
        
        // Limpiar archivo temporal
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        
        res.json({ url: response.data.data.url });
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: "Error en ImgBB API" });
    }
});

// Obtener estadísticas y lista completa
app.get('/api/admin/stats', async (req, res) => {
    try {
        const masVistos = await Producto.find().sort({ vistas: -1 }).limit(5);
        const ventasRecientes = await Pedido.find().sort({ fecha: -1 }).limit(10);
        res.json({ masVistos, ventasRecientes });
    } catch (e) { res.status(500).json({ error: "Error stats" }); }
});

app.get('/api/admin/productos-todos', async (req, res) => {
    const p = await Producto.find().sort({ _id: -1 });
    res.json(p);
});

// Crear y Borrar productos
app.post('/api/admin/productos', async (req, res) => {
    try {
        const nuevo = await Producto.create(req.body);
        res.json(nuevo);
    } catch (e) { res.status(400).send(e); }
});

app.delete('/api/admin/productos/:id', async (req, res) => {
    await Producto.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ==========================================
// 6. SISTEMA TELEGRAM (PEDIDOS ESPECIALES)
// ==========================================
app.post('/send-to-telegram', upload.single('userImage'), async (req, res) => {
    const { clientName, joyaNombre } = req.body;
    try {
        const fd = new FormData();
        fd.append('chat_id', CHAT_ID);
        fd.append('caption', `💍 **GEDALIA - NUEVA SOLICITUD**\n\n👤 Cliente: ${clientName}\n💎 Joya: ${joyaNombre}`);
        fd.append('photo', fs.createReadStream(req.file.path));

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, fd, { headers: fd.getHeaders() });
        
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// ==========================================
// 7. INICIO DE SERVIDOR
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor GEDALIA corriendo en puerto ${PORT}`);
});
