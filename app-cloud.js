// app-cloud.js - Clean cloud version with no database dependencies
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'your-secure-password-here';

// In-memory storage (resets on restart, but works for free deployment)
let todos_db = new Map(); // category -> { todos: [], nextId: 1 }

// Middleware
app.use(express.json());

// Simple authentication middleware
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    if (token !== APP_PASSWORD) {
        return res.status(401).json({ error: 'Invalid authentication' });
    }
    
    next();
}

// Serve static files (login page needs to be accessible)
app.use(express.static('public'));

// Login endpoint
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    if (password === APP_PASSWORD) {
        res.json({ 
            success: true, 
            token: APP_PASSWORD,
            message: 'Login successful' 
        });
    } else {
        res.status(401).json({ 
            success: false, 
            error: 'Invalid password' 
        });
    }
});

// Apply authentication to all API routes except login
app.use('/api', (req, res, next) => {
    if (req.path === '/login') {
        return next();
    }
    requireAuth(req, res, next);
});

// Get all categories
app.get('/api/categories', (req, res) => {
    const categories = Array.from(todos_db.keys()).sort();
    res.json(categories);
});

// Get todos for a category
app.get('/api/todos/:category', (req, res) => {
    const { category } = req.params;
    const categoryData = todos_db.get(category) || { todos: [], nextId: 1 };
    res.json(categoryData);
});

// Save todos for a category
app.post('/api/todos/:category', (req, res) => {
    const { category } = req.params;
    const { todos, nextId } = req.body;
    
    todos_db.set(category, { todos, nextId });
    res.json({ success: true });
});

// Delete a category
app.delete('/api/categories/:category', (req, res) => {
    const { category } = req.params;
    todos_db.delete(category);
    res.json({ success: true });
});

// Rename a category
app.put('/api/categories/:oldName', (req, res) => {
    const { oldName } = req.params;
    const { newName } = req.body;
    
    if (todos_db.has(newName)) {
        return res.status(400).json({ error: 'Category with new name already exists' });
    }
    
    const data = todos_db.get(oldName);
    if (data) {
        todos_db.set(newName, data);
        todos_db.delete(oldName);
    }
    
    res.json({ success: true });
});

// Sync endpoint for local-to-cloud migration
app.post('/api/sync/upload', (req, res) => {
    const { data } = req.body;
    
    Object.entries(data).forEach(([categoryName, categoryData]) => {
        todos_db.set(categoryName, categoryData);
    });
    
    res.json({ 
        success: true, 
        message: `Synced ${Object.keys(data).length} categories` 
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        categories: todos_db.size
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`☁️  TODO App running on port ${PORT}`);
    console.log(`🔑 App password: ${APP_PASSWORD}`);
    console.log(`🌐 Ready to use!`);
});

module.exports = app;
