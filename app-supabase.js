// app-supabase.js - Universal app with Supabase PostgreSQL + Priority & Order
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
        console.log('🟩 Connected to Supabase PostgreSQL');

        // Create categories table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create todos table with urgent flag and position fields
        await pool.query(`
            CREATE TABLE IF NOT EXISTS todos (
                id SERIAL PRIMARY KEY,
                category_name VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                completed BOOLEAN DEFAULT FALSE,
                todo_id INTEGER NOT NULL,
                urgent BOOLEAN DEFAULT FALSE,
                position INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add new columns if they don't exist (for existing databases)
        try {
            await pool.query(`ALTER TABLE todos ADD COLUMN IF NOT EXISTS urgent BOOLEAN DEFAULT FALSE`);
            await pool.query(`ALTER TABLE todos ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0`);
        } catch (error) {
            // Columns might already exist, ignore error
        }

        // Create indexes for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_todos_category 
            ON todos(category_name)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_todos_category_todo_id 
            ON todos(category_name, todo_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_todos_urgent_position 
            ON todos(category_name, urgent, position)
        `);

        console.log('🟩 Database tables initialized');
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

        // Get todos with urgent flag and position
        const todosResult = await pool.query(`
            SELECT 
                todo_id as id, 
                text, 
                completed, 
                COALESCE(urgent, FALSE) as urgent,
                COALESCE(position, todo_id) as position
            FROM todos 
            WHERE category_name = $1 
            ORDER BY 
                urgent DESC,
                COALESCE(position, todo_id)
        `, [category]);

        // Get max ID for next todo
        const maxIdResult = await pool.query(
            'SELECT MAX(todo_id) as max_id FROM todos WHERE category_name = $1',
            [category]
        );

        const todos = todosResult.rows.map(row => ({
            id: row.id,
            text: row.text,
            completed: row.completed,
            urgent: row.urgent,
            position: row.position
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

        // Insert new todos with urgent flag and position
        for (const todo of todos) {
            await client.query(`
                INSERT INTO todos (category_name, todo_id, text, completed, urgent, position) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                category,
                todo.id,
                todo.text,
                todo.completed,
                todo.urgent || false,
                todo.position || todo.id
            ]);
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

            // Insert todos with urgent flag support
            for (const todo of categoryData.todos) {
                await client.query(`
                    INSERT INTO todos (category_name, todo_id, text, completed, urgent, position) 
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    categoryName,
                    todo.id,
                    todo.text,
                    todo.completed,
                    todo.urgent || false,
                    todo.position || todo.id
                ]);
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

// Add these endpoints to your app-supabase.js file

// Export all data
app.get('/api/export', async (req, res) => {
    try {
        const { includeCompleted = 'true' } = req.query;
        const includeCompletedTodos = includeCompleted === 'true';

        // Get all categories
        const categoriesResult = await pool.query('SELECT name FROM categories ORDER BY name');
        const categories = categoriesResult.rows.map(row => row.name);

        const exportData = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            metadata: {
                totalCategories: categories.length,
                includeCompleted: includeCompletedTodos,
                exportedBy: 'TODO App',
                format: 'json'
            },
            categories: {}
        };

        // Get todos for each category
        for (const category of categories) {
            const todosQuery = includeCompletedTodos
                ? `SELECT todo_id as id, text, completed, 
                          COALESCE(urgent, FALSE) as urgent,
                          COALESCE(position, todo_id) as position,
                          created_at
                   FROM todos 
                   WHERE category_name = $1 
                   ORDER BY urgent DESC, COALESCE(position, todo_id)`
                : `SELECT todo_id as id, text, completed, 
                          COALESCE(urgent, FALSE) as urgent,
                          COALESCE(position, todo_id) as position,
                          created_at
                   FROM todos 
                   WHERE category_name = $1 AND completed = FALSE
                   ORDER BY urgent DESC, COALESCE(position, todo_id)`;

            const todosResult = await pool.query(todosQuery, [category]);

            const todos = todosResult.rows.map(row => ({
                id: row.id,
                text: row.text,
                completed: row.completed,
                urgent: row.urgent,
                position: row.position,
                createdAt: row.created_at
            }));

            // Get category stats
            const statsResult = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE completed = TRUE) as completed,
                    COUNT(*) FILTER (WHERE completed = FALSE) as open,
                    COUNT(*) FILTER (WHERE urgent = TRUE) as urgent
                FROM todos 
                WHERE category_name = $1
            `, [category]);

            const stats = statsResult.rows[0];

            exportData.categories[category] = {
                name: category,
                todos: todos,
                stats: {
                    total: parseInt(stats.total),
                    completed: parseInt(stats.completed),
                    open: parseInt(stats.open),
                    urgent: parseInt(stats.urgent)
                },
                nextId: todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1
            };
        }

        // Calculate total stats
        const totalStats = Object.values(exportData.categories).reduce((acc, cat) => {
            acc.totalTodos += cat.stats.total;
            acc.totalCompleted += cat.stats.completed;
            acc.totalOpen += cat.stats.open;
            acc.totalUrgent += cat.stats.urgent;
            return acc;
        }, { totalTodos: 0, totalCompleted: 0, totalOpen: 0, totalUrgent: 0 });

        exportData.metadata = { ...exportData.metadata, ...totalStats };

        // Set appropriate headers for file download
        const filename = `todo-export-${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.json(exportData);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// Import data
app.post('/api/import', async (req, res) => {
    const client = await pool.connect();

    try {
        const { data: importData, options = {} } = req.body;
        const {
            overwriteExisting = false,
            skipCompleted = false,
            mergeStrategy = 'replace' // 'replace', 'merge', 'skip'
        } = options;

        // Validate import data
        if (!importData || !importData.version || !importData.categories) {
            return res.status(400).json({
                error: 'Invalid import data format',
                details: 'Expected format with version and categories'
            });
        }

        // Version compatibility check
        const supportedVersions = ['1.0.0'];
        if (!supportedVersions.includes(importData.version)) {
            return res.status(400).json({
                error: 'Unsupported data version',
                version: importData.version,
                supported: supportedVersions
            });
        }

        await client.query('BEGIN');

        const importResults = {
            categoriesProcessed: 0,
            categoriesCreated: 0,
            categoriesSkipped: 0,
            todosImported: 0,
            todosSkipped: 0,
            errors: []
        };

        // Process each category
        for (const [categoryName, categoryData] of Object.entries(importData.categories)) {
            try {
                importResults.categoriesProcessed++;

                // Check if category exists
                const existingCategory = await client.query(
                    'SELECT name FROM categories WHERE name = $1',
                    [categoryName]
                );

                if (existingCategory.rows.length > 0) {
                    if (mergeStrategy === 'skip') {
                        importResults.categoriesSkipped++;
                        continue;
                    }

                    if (mergeStrategy === 'replace' || overwriteExisting) {
                        // Clear existing todos for this category
                        await client.query('DELETE FROM todos WHERE category_name = $1', [categoryName]);
                    }
                } else {
                    // Create new category
                    await client.query(
                        'INSERT INTO categories (name) VALUES ($1)',
                        [categoryName]
                    );
                    importResults.categoriesCreated++;
                }

                // Import todos
                const todos = categoryData.todos || [];
                for (const todo of todos) {
                    // Skip completed todos if requested
                    if (skipCompleted && todo.completed) {
                        importResults.todosSkipped++;
                        continue;
                    }

                    // For merge strategy, check if todo already exists
                    if (mergeStrategy === 'merge' && !overwriteExisting) {
                        const existingTodo = await client.query(
                            'SELECT id FROM todos WHERE category_name = $1 AND todo_id = $2',
                            [categoryName, todo.id]
                        );

                        if (existingTodo.rows.length > 0) {
                            importResults.todosSkipped++;
                            continue;
                        }
                    }

                    // Insert todo
                    await client.query(`
                        INSERT INTO todos (category_name, todo_id, text, completed, urgent, position, created_at) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (category_name, todo_id) 
                        DO UPDATE SET 
                            text = EXCLUDED.text,
                            completed = EXCLUDED.completed,
                            urgent = EXCLUDED.urgent,
                            position = EXCLUDED.position
                    `, [
                        categoryName,
                        todo.id,
                        todo.text,
                        todo.completed,
                        todo.urgent || false,
                        todo.position || todo.id,
                        todo.createdAt || new Date()
                    ]);

                    importResults.todosImported++;
                }

            } catch (categoryError) {
                importResults.errors.push({
                    category: categoryName,
                    error: categoryError.message
                });
                console.error(`Error importing category ${categoryName}:`, categoryError);
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: `Import completed successfully`,
            results: importResults,
            importedFrom: {
                version: importData.version,
                exportDate: importData.exportDate,
                totalCategories: Object.keys(importData.categories).length
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Import error:', error);
        res.status(500).json({
            error: 'Import failed',
            details: error.message
        });
    } finally {
        client.release();
    }
});

// Get import/export statistics
app.get('/api/export/stats', async (req, res) => {
    try {
        const statsQuery = `
            SELECT 
                COUNT(DISTINCT category_name) as total_categories,
                COUNT(*) as total_todos,
                COUNT(*) FILTER (WHERE completed = TRUE) as completed_todos,
                COUNT(*) FILTER (WHERE completed = FALSE) as open_todos,
                COUNT(*) FILTER (WHERE urgent = TRUE) as urgent_todos,
                MIN(created_at) as oldest_todo,
                MAX(created_at) as newest_todo
            FROM todos
        `;

        const result = await pool.query(statsQuery);
        const stats = result.rows[0];

        res.json({
            totalCategories: parseInt(stats.total_categories),
            totalTodos: parseInt(stats.total_todos),
            completedTodos: parseInt(stats.completed_todos),
            openTodos: parseInt(stats.open_todos),
            urgentTodos: parseInt(stats.urgent_todos),
            oldestTodo: stats.oldest_todo,
            newestTodo: stats.newest_todo,
            exportFormats: ['json'],
            supportedVersions: ['1.0.0']
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
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
    console.log('🟩 Database connections closed');
    process.exit(0);
});

start();