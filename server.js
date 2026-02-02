const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000;

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ GEDALIA Enterprise: Online"))
    .catch(err => console.error("❌ DB Error:", err));

// Esquema extendido
const ProductoSchema = new mongoose.Schema({
    nombre: String,
    categoria: String,
    precioBase: Number,
    imagenes: [String],
    stock: { type: Boolean, default: true },
    vistas: { type: Number, default: 0 }, // Para estadísticas
    descuento: { type: Number, default: 0 }, // Porcentaje
    envioGratis: { type: Boolean, default: false }
});
const Producto = mongoose.model('Producto', ProductoSchema);

const PedidoSchema = new mongoose.Schema({
    cliente: String,
    joya: String,
    monto: Number,
    tipo: String, // "Carrito" o "Compra Rápida"
    fecha: { type: Date, default: Date.now }
});
const Pedido = mongoose.model('Pedido', PedidoSchema);

app.use(express.json());
app.use(express.static(__dirname));
const upload = multer({ dest: 'uploads/' });

// --- RUTAS DE TIENDA ---

app.get('/api/productos', async (req, res) => {
    const productos = await Producto.find({ stock: true });
    res.json(productos);
});

// Incrementar vistas
app.post('/api/productos/view/:id', async (req, res) => {
    await Producto.findByIdAndUpdate(req.params.id, { $inc: { vistas: 1 } });
    res.sendStatus(200);
});

// Registro de Compra
app.post('/api/comprar', async (req, res) => {
    const pedido = await Pedido.create(req.body);
    res.json({ success: true, pedido });
});

// --- RUTAS ADMIN & STATS ---

app.get('/api/admin/stats', async (req, res) => {
    const masVistos = await Producto.find().sort({ vistas: -1 }).limit(5);
    const ventasRecientes = await Pedido.find().sort({ fecha: -1 }).limit(10);
    res.json({ masVistos, ventasRecientes });
});

app.post('/api/admin/productos', async (req, res) => {
    const nuevo = await Producto.create(req.body);
    res.json(nuevo);
});

app.patch('/api/admin/productos/:id', async (req, res) => {
    const p = await Producto.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(p);
});

app.delete('/api/admin/productos/:id', async (req, res) => {
    await Producto.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server GEDALIA Premium en ${PORT}`));
