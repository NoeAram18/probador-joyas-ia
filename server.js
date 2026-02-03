const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const mongoose = require('mongoose');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

mongoose.connect(process.env.MONGO_URI);

// ESQUEMAS
const Producto = mongoose.model('Producto', new mongoose.Schema({
    nombre: String,
    categoria: String,
    precioBase: Number,
    imagenes: [String],
    vistas: { type: Number, default: 0 },
    interacciones: { type: Number, default: 0 }, // Clicks en botones de compra
    stock: { type: Boolean, default: true },
    descuento: { type: Number, default: 0 },
    envioGratis: { type: Boolean, default: false }
}));

const Pedido = mongoose.model('Pedido', new mongoose.Schema({
    idProducto: mongoose.Schema.Types.ObjectId,
    monto: Number,
    fecha: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.static(__dirname));
const upload = multer({ dest: 'uploads/' });

// --- API TIENDA ---
app.get('/api/productos', async (req, res) => {
    res.json(await Producto.find({ stock: true }));
});

app.post('/api/productos/view/:id', async (req, res) => {
    await Producto.findByIdAndUpdate(req.params.id, { $inc: { vistas: 1 } });
    res.sendStatus(200);
});

app.post('/api/productos/interact/:id', async (req, res) => {
    await Producto.findByIdAndUpdate(req.params.id, { $inc: { interacciones: 1 } });
    res.sendStatus(200);
});

// --- API ADMIN ---
app.get('/api/admin/productos-detallado', async (req, res) => {
    // Agregamos compras por producto
    const prods = await Producto.find().lean();
    const prodsConVentas = await Promise.all(prods.map(async (p) => {
        const ventas = await Pedido.countDocuments({ idProducto: p._id });
        return { ...p, ventas };
    }));
    res.json(prodsConVentas);
});

app.post('/api/admin/upload-image', upload.single('image'), async (req, res) => {
    try {
        const form = new FormData();
        form.append('image', fs.createReadStream(req.file.path));
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, form, { headers: form.getHeaders() });
        fs.unlinkSync(req.file.path);
        res.json({ url: response.data.data.url });
    } catch (e) { res.status(500).send("Error imagen"); }
});

app.post('/api/admin/productos', async (req, res) => {
    res.json(await Producto.create(req.body));
});

// NUEVA RUTA: EDITAR
app.patch('/api/admin/productos/:id', async (req, res) => {
    const actualizado = await Producto.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(actualizado);
});

app.delete('/api/admin/productos/:id', async (req, res) => {
    await Producto.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => console.log("Gedalia ERP Ready"));
