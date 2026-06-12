require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const Product = require('./models/Product');
const Testimonial = require('./models/Testimonial');
const Game = require('./models/Game');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Cloudinary
if (process.env.CLOUDINARY_URL) {
    cloudinary.config(process.env.CLOUDINARY_URL);
} else {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

// Configure Multer (file upload)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed!'), false);
        }
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (main website & admin)

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(async () => {
    console.log('✅ Connected to MongoDB!');
    
    // Initialize default games if none exist
    const gameCount = await Game.countDocuments();
    if (gameCount === 0) {
        const defaultGames = [
            { name: 'Mobile Legends', code: 'ml', icon: 'fas fa-gamepad' },
            { name: 'Free Fire', code: 'ff', icon: 'fas fa-fire' },
            { name: 'Genshin Impact', code: 'genshin', icon: 'fas fa-gem' },
            { name: 'Valorant', code: 'valorant', icon: 'fas fa-crosshairs' }
        ];
        await Game.insertMany(defaultGames);
        console.log('✅ Default games initialized!');
    }
})
.catch(err => console.error('❌ MongoDB connection error:', err));

// Helper function untuk upload ke Cloudinary
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'panzzstore' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    });
};

// ==============================
// API ROUTES FOR MAIN WEBSITE
// ==============================

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all games
app.get('/api/games', async (req, res) => {
    try {
        const games = await Game.find().sort({ name: 1 });
        res.json(games);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new game
app.post('/api/games', async (req, res) => {
    try {
        const game = new Game({
            name: req.body.name,
            code: req.body.code.toLowerCase().replace(/\s+/g, '-'),
            icon: req.body.icon || 'fas fa-gamepad'
        });
        await game.save();
        res.status(201).json({ message: 'Game created!', game });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete game
app.delete('/api/games/:id', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);
        if (!game) return res.status(404).json({ error: 'Game not found' });
        
        // Also delete all products for this game
        await Product.deleteMany({ game: game.code });
        
        await Game.findByIdAndDelete(req.params.id);
        res.json({ message: 'Game deleted!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all testimonials
app.get('/api/testimonials', async (req, res) => {
    try {
        const testimonials = await Testimonial.find().sort({ createdAt: -1 });
        res.json(testimonials);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new testimonial (from user)
app.post('/api/testimonials', async (req, res) => {
    try {
        const testimonial = new Testimonial({
            name: req.body.name,
            game: req.body.game,
            rating: req.body.rating,
            text: req.body.text,
            photo: null, // User tidak upload foto, hanya admin
            isAdmin: false
        });
        await testimonial.save();
        res.status(201).json({ message: 'Testimonial created!', testimonial });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ==============================
// API ROUTES FOR ADMIN PANEL
// ==============================

// Create new product
app.post('/api/products', upload.array('productPhotos', 10), async (req, res) => {
    try {
        let photoUrls = [];
        
        // Upload photos to Cloudinary jika ada
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await uploadToCloudinary(file.buffer);
                photoUrls.push(result.secure_url);
            }
        }
        
        // Add URL from textarea jika ada
        if (req.body.photosText) {
            const textUrls = req.body.photosText.split('\n').filter(url => url.trim());
            photoUrls = [...photoUrls, ...textUrls];
        }
        
        const productData = {
            game: req.body.game,
            title: req.body.title,
            badge: req.body.badge,
            icon: req.body.icon,
            price: req.body.price,
            priceNum: parseInt(req.body.priceNum),
            features: req.body.features.split('\n').filter(f => f.trim()),
            spec: req.body.spec.split('\n').filter(s => s.trim()),
            minus: req.body.minus.split('\n').filter(m => m.trim()),
            photos: photoUrls.length > 0 ? photoUrls : ['https://via.placeholder.com/300x200/7c3aed/ffffff?text=Panzz'],
            accountData: {
                email: req.body.email || 'placeholder@email.com',
                passwordEmail: req.body.passwordEmail || 'placeholder',
                passwordAccount: req.body.passwordAccount || 'placeholder',
                server: req.body.server || 'Placeholder',
                securityQuestion: req.body.securityQuestion || 'Placeholder',
                securityAnswer: req.body.securityAnswer || 'Placeholder'
            }
        };
        
        const product = new Product(productData);
        await product.save();
        res.status(201).json({ message: 'Product created!', product });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update existing product
app.put('/api/products/:id', upload.array('productPhotos', 10), async (req, res) => {
    try {
        let photoUrls = [];
        
        // Upload new photos to Cloudinary jika ada
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await uploadToCloudinary(file.buffer);
                photoUrls.push(result.secure_url);
            }
        }
        
        // Get existing product
        const existingProduct = await Product.findById(req.params.id);
        if (!existingProduct) return res.status(404).json({ error: 'Product not found' });
        
        // Combine with existing photos
        if (req.body.photosText) {
            const textUrls = req.body.photosText.split('\n').filter(url => url.trim());
            photoUrls = [...photoUrls, ...textUrls];
        } else {
            photoUrls = [...existingProduct.photos];
        }
        
        const productData = {
            game: req.body.game,
            title: req.body.title,
            badge: req.body.badge,
            icon: req.body.icon,
            price: req.body.price,
            priceNum: parseInt(req.body.priceNum),
            features: req.body.features.split('\n').filter(f => f.trim()),
            spec: req.body.spec.split('\n').filter(s => s.trim()),
            minus: req.body.minus.split('\n').filter(m => m.trim()),
            photos: photoUrls.length > 0 ? photoUrls : ['https://via.placeholder.com/300x200/7c3aed/ffffff?text=Panzz'],
            accountData: {
                email: req.body.email || 'placeholder@email.com',
                passwordEmail: req.body.passwordEmail || 'placeholder',
                passwordAccount: req.body.passwordAccount || 'placeholder',
                server: req.body.server || 'Placeholder',
                securityQuestion: req.body.securityQuestion || 'Placeholder',
                securityAnswer: req.body.securityAnswer || 'Placeholder'
            },
            updatedAt: Date.now()
        };
        
        const product = await Product.findByIdAndUpdate(req.params.id, productData, { new: true });
        res.json({ message: 'Product updated!', product });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Create new testimonial with photo
app.post('/api/admin/testimonials', upload.single('testimonialPhoto'), async (req, res) => {
    try {
        let photoUrl = null;
        
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer);
            photoUrl = result.secure_url;
        }
        
        const testimonial = new Testimonial({
            name: req.body.name,
            game: req.body.game,
            rating: parseInt(req.body.rating),
            text: req.body.text,
            photo: photoUrl,
            isAdmin: true
        });
        
        await testimonial.save();
        res.status(201).json({ message: 'Testimonial created!', testimonial });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Admin: Delete testimonial
app.delete('/api/admin/testimonials/:id', async (req, res) => {
    try {
        const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
        if (!testimonial) return res.status(404).json({ error: 'Testimonial not found' });
        res.json({ message: 'Testimonial deleted!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});