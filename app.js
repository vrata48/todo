// app.js - Simple TODO App with File System Persistence
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3022;
const DATA_DIR = './data';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// Get all categories
app.get('/api/categories', async (req, res) => {
    try {
        const files = await fs.readdir(DATA_DIR);
        const categories = files
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));
        res.json(categories);
    } catch (error) {
        res.json([]);
    }
});

// Get todos for a category
app.get('/api/todos/:category', async (req, res) => {
    const { category } = req.params;
    const filePath = path.join(DATA_DIR, `${category}.json`);

    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.json({ todos: [], nextId: 1 });
    }
});

// Save todos for a category
app.post('/api/todos/:category', async (req, res) => {
    const { category } = req.params;
    const { todos, nextId } = req.body;
    const filePath = path.join(DATA_DIR, `${category}.json`);

    try {
        const data = { todos, nextId };
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save todos' });
    }
});

// Delete a category
app.delete('/api/categories/:category', async (req, res) => {
    const { category } = req.params;
    const filePath = path.join(DATA_DIR, `${category}.json`);

    try {
        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// Rename a category
app.put('/api/categories/:oldName', async (req, res) => {
    const { oldName } = req.params;
    const { newName } = req.body;
    const oldPath = path.join(DATA_DIR, `${oldName}.json`);
    const newPath = path.join(DATA_DIR, `${newName}.json`);

    try {
        // Check if new name already exists
        try {
            await fs.access(newPath);
            return res.status(400).json({ error: 'Category with new name already exists' });
        } catch {
            // Good, new name doesn't exist
        }

        // Rename the file
        await fs.rename(oldPath, newPath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to rename category' });
    }
});

// Start server
async function startServer() {
    await ensureDataDir();
    app.listen(PORT, () => {
        console.log(`📝 TODO App running at http://localhost:${PORT}`);
        console.log(`📁 Data saved to: ${path.resolve(DATA_DIR)}`);
    });
}

startServer();