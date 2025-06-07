// sync-to-cloud.js - Script to sync local data to cloud
const fs = require('fs').promises;
const path = require('path');

async function syncToCloud(cloudUrl, password) {
    try {
        console.log('🔄 Starting sync to cloud...');

        const DATA_DIR = './data';

        // Check if data directory exists
        try {
            await fs.access(DATA_DIR);
        } catch {
            console.log('📭 No local data directory found');
            return;
        }

        // Read all local JSON files
        const files = await fs.readdir(DATA_DIR);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        if (jsonFiles.length === 0) {
            console.log('📭 No local data found to sync');
            return;
        }

        const syncData = {};

        // Load all category data
        for (const file of jsonFiles) {
            const categoryName = file.replace('.json', '');
            const filePath = path.join(DATA_DIR, file);
            const data = await fs.readFile(filePath, 'utf8');
            syncData[categoryName] = JSON.parse(data);
        }

        console.log(`📦 Found ${Object.keys(syncData).length} categories to sync:`, Object.keys(syncData));

        // First, login to get auth token
        console.log('🔐 Logging in...');
        const loginResponse = await fetch(`${cloudUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (!loginResponse.ok) {
            console.error('❌ Login failed:', loginResponse.statusText);
            return;
        }

        const loginResult = await loginResponse.json();
        const token = loginResult.token;

        // Send to cloud
        console.log('📤 Uploading data...');
        const response = await fetch(`${cloudUrl}/api/sync/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data: syncData })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('✅ Sync successful:', result.message);
        } else {
            console.error('❌ Sync failed:', response.statusText);
        }

    } catch (error) {
        console.error('❌ Sync error:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    const cloudUrl = process.argv[2];
    const password = process.argv[3];

    if (!cloudUrl || !password) {
        console.log('Usage: node sync-to-cloud.js <CLOUD_URL> <PASSWORD>');
        console.log('Example: node sync-to-cloud.js https://your-app.onrender.com mypassword123');
    } else {
        syncToCloud(cloudUrl, password);
    }
}

module.exports = { syncToCloud };