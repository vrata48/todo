# TODO

A simple task management app that works everywhere. Built with Node.js, Express, and PostgreSQL.

## Features

- **Categories** - Organize todos by project, priority, or context
- **Smart Links** - Auto-converts DEPM/DDS tickets and URLs to clickable links  
- **Inline Editing** - Click any todo or category name to edit instantly
- **Progress Tracking** - See completion counters for each category
- **Bulk Actions** - Clear all completed tasks at once
- **Password Protected** - Secure access with simple password authentication
- **Progressive Web App** - Install on mobile devices like a native app
- **Cloud Sync** - Access same todos from any device
- **Offline Ready** - Works without internet connection

## Deployment

This app is designed for **Render** deployment with **Supabase** as the database provider. Both offer generous free tiers perfect for personal use.

Set the following environment variables in your deployment platform:
- `APP_PASSWORD` = your secure password  
- `DATABASE_URL` = your PostgreSQL connection string

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `APP_PASSWORD` | Login password for the app |
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_ENV` | Environment (optional) |
| `PORT` | Server port (optional) |

### Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Supabase)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **PWA**: Service Worker + Web App Manifest
- **Authentication**: Simple token-based auth
