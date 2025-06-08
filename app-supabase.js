// app-supabase.js - Universal app with Supabase PostgreSQL
require('dotenv').config(); // Load .env file

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'your-secure-password-here';

// Supabase connection - works for both local and cloud
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!DATABASE_URL) {
    console.error('❌ Missing DATABASE_URL or SUPABASE_DB_URL environment variable');
    console.log('📝 Please set your Supabase connection string');
    process.exit(1);
}

// PostgreSQL connection pool
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDatabase() {
    try {
        console.log('🔄 Connecting to Supabase...');

        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Connected to Supabase PostgreSQL');

        // Create tables if they don't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS todos (
                id SERIAL PRIMARY KEY,
                category_name VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                completed BOOLEAN DEFAULT FALSE,
                todo_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_todos_category 
            ON todos(category_name)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_todos_category_todo_id 
            ON todos(category_name, todo_id)
        `);

        console.log('✅ Database tables initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

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

// Serve static files
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
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT name FROM categories ORDER BY name');
        const categories = result.rows.map(row => row.name);
        res.json(categories);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get todos for a category
app.get('/api/todos/:category', async (req, res) => {
    try {
        const { category } = req.params;

        // Get todos
        const todosResult = await pool.query(
            'SELECT todo_id as id, text, completed FROM todos WHERE category_name = $1 ORDER BY todo_id',
            [category]
        );

        // Get max ID for next todo
        const maxIdResult = await pool.query(
            'SELECT MAX(todo_id) as max_id FROM todos WHERE category_name = $1',
            [category]
        );

        const todos = todosResult.rows.map(row => ({
            id: row.id,
            text: row.text,
            completed: row.completed
        }));

        const nextId = (maxIdResult.rows[0].max_id || 0) + 1;

        res.json({ todos, nextId });
    } catch (error) {
        console.error('Get todos error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Save todos for a category
app.post('/api/todos/:category', async (req, res) => {
    const client = await pool.connect();

    try {
        const { category } = req.params;
        const { todos } = req.body;

        await client.query('BEGIN');

        // Ensure category exists
        await client.query(
            'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
            [category]
        );

        // Clear existing todos for this category
        await client.query('DELETE FROM todos WHERE category_name = $1', [category]);

        // Insert new todos
        for (const todo of todos) {
            await client.query(
                'INSERT INTO todos (category_name, todo_id, text, completed) VALUES ($1, $2, $3, $4)',
                [category, todo.id, todo.text, todo.completed]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Save todos error:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// Delete a category
app.delete('/api/categories/:category', async (req, res) => {
    const client = await pool.connect();

    try {
        const { category } = req.params;

        await client.query('BEGIN');
        await client.query('DELETE FROM todos WHERE category_name = $1', [category]);
        await client.query('DELETE FROM categories WHERE name = $1', [category]);
        await client.query('COMMIT');

        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// Rename a category
app.put('/api/categories/:oldName', async (req, res) => {
    const client = await pool.connect();

    try {
        const { oldName } = req.params;
        const { newName } = req.body;

        // Check if new name already exists
        const existsResult = await client.query(
            'SELECT name FROM categories WHERE name = $1',
            [newName]
        );

        if (existsResult.rows.length > 0) {
            return res.status(400).json({ error: 'Category with new name already exists' });
        }

        await client.query('BEGIN');
        await client.query('UPDATE categories SET name = $1 WHERE name = $2', [newName, oldName]);
        await client.query('UPDATE todos SET category_name = $1 WHERE category_name = $2', [newName, oldName]);
        await client.query('COMMIT');

        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Rename category error:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// Sync endpoint for data migration
app.post('/api/sync/upload', async (req, res) => {
    const client = await pool.connect();

    try {
        const { data } = req.body;
        let syncedCategories = 0;

        await client.query('BEGIN');

        for (const [categoryName, categoryData] of Object.entries(data)) {
            // Ensure category exists
            await client.query(
                'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
                [categoryName]
            );

            // Clear existing todos for this category
            await client.query('DELETE FROM todos WHERE category_name = $1', [categoryName]);

            // Insert todos
            for (const todo of categoryData.todos) {
                await client.query(
                    'INSERT INTO todos (category_name, todo_id, text, completed) VALUES ($1, $2, $3, $4)',
                    [categoryName, todo.id, todo.text, todo.completed]
                );
            }

            syncedCategories++;
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: `Synced ${syncedCategories} categories to Supabase`
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Sync failed' });
    } finally {
        client.release();
    }
});

// Health check
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as timestamp');
        res.json({
            status: 'ok',
            timestamp: result.rows[0].timestamp,
            database: 'Supabase PostgreSQL'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Start server
async function start() {
    try {
        await initDatabase();

        app.listen(PORT, () => {
            console.log(`☁️ TODO App running on port ${PORT}`);
            console.log(`🔑 App password: ${APP_PASSWORD}`);
            console.log(`💾 Database: Supabase PostgreSQL`);
            console.log(`🌐 ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'} mode`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down gracefully...');
    await pool.end();
    console.log('✅ Database connections closed');
    process.exit(0);
});

start();
