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

## Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (designed for Supabase)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/todo.git
   cd todo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your values:
   ```env
   APP_PASSWORD=your-secure-password
   DATABASE_URL=your-postgresql-connection-string
   ```

4. **Start the app**
   ```bash
   npm start
   ```

5. **Open your browser**
   ```
   http://localhost:3000
   ```

The app will automatically create the required database tables on first run.

## Deployment

This app is designed for **Render** deployment with **Supabase** as the database provider. Both offer generous free tiers perfect for personal use.

Set the following environment variables in your deployment platform:
- `APP_PASSWORD` = your secure password  
- `DATABASE_URL` = your PostgreSQL connection string

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_PASSWORD` | Login password for the app | `MySecurePass123` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres...` |
| `NODE_ENV` | Environment (optional) | `production` |
| `PORT` | Server port (optional) | `3000` |

### Smart Link Detection

The app automatically converts:
- **DEPM-1234** → Links to Jira tickets
- **DDS-5678** → Links to Jira tickets  
- **http://example.com** → Smart captions for URLs

##️ Development

### Available Scripts

```bash
npm start        # Start the server
npm run dev      # Development with auto-restart
```

### Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Supabase)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **PWA**: Service Worker + Web App Manifest
- **Authentication**: Simple token-based auth

## License

MIT License - feel free to use for personal or commercial projects.
