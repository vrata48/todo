// app-cloud.js - Cloud version with PostgreSQL for Render
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'your-secure-password-here';

// For Render, we'll use in-memory storage initially, then PostgreSQL
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
    console.log(`🌐 Visit: https://your-app-name.onrender.com`);
});

module.exports = app;

function initDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            console.log('Connected to SQLite database');

            // Create tables
            db.serialize(() => {
                // Categories table
                db.run(`CREATE TABLE IF NOT EXISTS categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                // Todos table
                db.run(`CREATE TABLE IF NOT EXISTS todos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_name TEXT NOT NULL,
                    text TEXT NOT NULL,
                    completed BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (category_name) REFERENCES categories (name)
                )`);

                resolve();
            });
        });
    });
}

// Get all categories
app.get('/api/categories', (req, res) => {
    db.all('SELECT name FROM categories ORDER BY name', [], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Database error' });
            return;
        }
        const categories = rows.map(row => row.name);
        res.json(categories);
    });
});

// Get todos for a category
app.get('/api/todos/:category', (req, res) => {
    const { category } = req.params;

    db.all(
        'SELECT id, text, completed FROM todos WHERE category_name = ? ORDER BY id',
        [category],
        (err, rows) => {
            if (err) {
                console.error(err);
                res.status(500).json({ error: 'Database error' });
                return;
            }

            // Calculate next ID
            db.get(
                'SELECT MAX(id) as maxId FROM todos WHERE category_name = ?',
                [category],
                (err, row) => {
                    if (err) {
                        console.error(err);
                        res.status(500).json({ error: 'Database error' });
                        return;
                    }

                    const todos = rows.map(row => ({
                        id: row.id,
                        text: row.text,
                        completed: !!row.completed
                    }));

                    res.json({
                        todos,
                        nextId: (row.maxId || 0) + 1
                    });
                }
            );
        }
    );
});

// Save todos for a category
app.post('/api/todos/:category', (req, res) => {
    const { category } = req.params;
    const { todos } = req.body;

    db.serialize(() => {
        // Ensure category exists
        db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [category]);

        // Clear existing todos for this category
        db.run('DELETE FROM todos WHERE category_name = ?', [category]);

        // Insert new todos
        const stmt = db.prepare('INSERT INTO todos (id, category_name, text, completed) VALUES (?, ?, ?, ?)');

        todos.forEach(todo => {
            stmt.run([todo.id, category, todo.text, todo.completed ? 1 : 0]);
        });

        stmt.finalize((err) => {
            if (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to save todos' });
                return;
            }
            res.json({ success: true });
        });
    });
});

// Delete a category
app.delete('/api/categories/:category', (req, res) => {
    const { category } = req.params;

    db.serialize(() => {
        db.run('DELETE FROM todos WHERE category_name = ?', [category]);
        db.run('DELETE FROM categories WHERE name = ?', [category], function(err) {
            if (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to delete category' });
                return;
            }
            res.json({ success: true });
        });
    });
});

// Rename a category
app.put('/api/categories/:oldName', (req, res) => {
    const { oldName } = req.params;
    const { newName } = req.body;

    db.serialize(() => {
        // Check if new name already exists
        db.get('SELECT name FROM categories WHERE name = ?', [newName], (err, row) => {
            if (err) {
                console.error(err);
                res.status(500).json({ error: 'Database error' });
                return;
            }

            if (row) {
                res.status(400).json({ error: 'Category with new name already exists' });
                return;
            }

            // Update category name
            db.run('UPDATE categories SET name = ? WHERE name = ?', [newName, oldName]);
            db.run('UPDATE todos SET category_name = ? WHERE category_name = ?', [newName, oldName], function(err) {
                if (err) {
                    console.error(err);
                    res.status(500).json({ error: 'Failed to rename category' });
                    return;
                }
                res.json({ success: true });
            });
        });
    });
});

// Sync endpoint for local-to-cloud migration
app.post('/api/sync/upload', (req, res) => {
    const { data } = req.body; // { categoryName: { todos: [], nextId: 1 } }

    db.serialize(() => {
        let completed = 0;
        const categories = Object.keys(data);

        if (categories.length === 0) {
            res.json({ success: true, message: 'No data to sync' });
            return;
        }

        categories.forEach(categoryName => {
            const categoryData = data[categoryName];

            // Ensure category exists
            db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [categoryName]);

            // Clear existing todos for this category
            db.run('DELETE FROM todos WHERE category_name = ?', [categoryName]);

            // Insert todos
            const stmt = db.prepare('INSERT INTO todos (id, category_name, text, completed) VALUES (?, ?, ?, ?)');

            categoryData.todos.forEach(todo => {
                stmt.run([todo.id, categoryName, todo.text, todo.completed ? 1 : 0]);
            });

            stmt.finalize(() => {
                completed++;
                if (completed === categories.length) {
                    res.json({ success: true, message: `Synced ${categories.length} categories` });
                }
            });
        });
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, () => {
            console.log(`☁️  Cloud TODO App running on port ${PORT}`);
            console.log(`🌐 Available at: ${process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    if (db) {
        db.close((err) => {
            if (err) {
                console.error(err.message);
            }
            console.log('Database connection closed.');
            process.exit(0);
        });
    }
});

startServer();