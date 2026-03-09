# 🎬 Video Downloader Bot (Telegram)

Bot Telegram untuk mengunduh video dari berbagai platform streaming video secara otomatis menggunakan `yt-dlp`.

## ✨ Fitur

- 📥 **Download Video** - Unduh dari ribuan platform video
- 📁 **Manajemen Folder** - Organize downloads dalam folder berbeda
- 📊 **Statistik Real-time** - Track download success rate dan stats
- 🗑️ **Cache Management** - Control duplicate prevention
- 👷 **Worker Queue** - Proses multiple downloads secara parallel
- 🔁 **Auto Retry** - Automatic retry dengan exponential backoff
- 🧹 **Auto Cleanup** - Delete old files automatically
- 🔐 **User Authentication** - Whitelist access control

## 📋 Requirements

- Node.js >= 18.0.0
- `yt-dlp` installed pada system
- Telegram Bot Token (dari @BotFather)

## 🚀 Installation

```bash
# Clone atau download project
cd video-downloader-bot

# Install dependencies
npm install

# Verify yt-dlp installed
yt-dlp --version

# Setup environment variables
cp .env.example .env
# Edit .env dengan token Anda
```

## ⚙️ Configuration

Buat file `.env`:

```env
# Required
BOT_TOKEN=your_telegram_bot_token_here

# Optional - Batasi akses ke user tertentu
ALLOWED_USER_IDS=123456789,987654321

# Queue & Workers (default values)
MAX_QUEUE_SIZE=100
MAX_WORKERS=5
MAX_RETRIES=3
TIMEOUT=30

# Storage
DOWNLOAD_DIR=/path/to/custom/downloads
CLEANUP_DAYS=7

# Logging
LOG_LEVEL=info
```

## 📖 Usage

### Development
```bash
npm run dev    # Run dengan auto-reload pada file changes
```

### Production
```bash
npm start      # Run bot
```

### Testing
```bash
npm test       # Run unit tests
npm run test:watch  # Run tests in watch mode
```

## 📁 Project Structure

```
src/
├── config/          # Configuration management
├── errors/          # Custom error classes
├── handlers/        # Telegram message handlers
├── messages/        # Message templates
├── services/        # Business logic (download, storage, state)
├── utils/           # Helper utilities
└── workers/         # Queue and worker logic

tests/              # Unit tests
```

## 🔄 Architecture

### State Management
- **StateManager** - Persist processed links dan stats ke `bot_state.json`
- **StorageManager** - Manage download folders dan file operations

### Download Queue
- **AsyncQueue** - Simple async queue dengan priority support
- **Workers** - Multiple workers process queue items in parallel
- **DownloadService** - Handle actual video downloads via `yt-dlp`

### Error Handling
Custom error classes untuk better error categorization:
- `DownloadError` - Download failures
- `ValidationError` - Input validation errors
- `StorageError` - File system errors
- `ConfigError` - Configuration issues

### Logging
Winston logger dengan:
- Console output (colorized)
- File logging (error.log, combined.log)
- Log rotation (5MB per file, keep 5 files)
- Configurable log levels

## 📚 API Documentation

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Show main menu |
| Send link | Queue video for download |
| 📊 Statistik | View download statistics |
| 📋 Antrian | View current queue status |
| 📁 Ganti Folder | Change download folder |
| 🗑️ Kelola Cache | Manage cache links |
| ❓ Bantuan | Show help/guide |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| BOT_TOKEN | - | Telegram bot token (required) |
| ALLOWED_USER_IDS | "" | Comma-separated user IDs to allow |
| MAX_QUEUE_SIZE | 100 | Maximum queue items |
| MAX_WORKERS | 5 | Number of parallel workers |
| MAX_RETRIES | 3 | Retry attempts per download |
| TIMEOUT | 30 | API request timeout (seconds) |
| CLEANUP_DAYS | 7 | Auto-delete files older than N days |
| LOG_LEVEL | info | Logging level (debug, info, warn, error) |

## 🧪 Testing

Project includes unit tests untuk critical functions:

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

Test coverage includes:
- ✅ Input validation & sanitization
- ✅ URL extraction & validation
- ✅ Queue operations
- ✅ State management
- ✅ Error handling

## 🐛 Troubleshooting

### Bot tidak respond
1. Check `BOT_TOKEN` di `.env`
2. Verify bot running: `npm run dev`
3. Check logs: `tail -f logs/combined.log`

### Downloads tidak berjalan
1. Check `yt-dlp` installed: `yt-dlp --version`
2. Test download: `yt-dlp https://example.com -o test.mp4`
3. Check folder permissions: `ls -la Downloads/`
4. Review logs for errors

### Queue penuh
Increase `MAX_QUEUE_SIZE` di `.env` atau tingkatkan `MAX_WORKERS`

### Disk space issues
Reduce `CLEANUP_DAYS` untuk lebih agresif delete old files

## 📊 Monitoring

Check application health:

```bash
# View recent logs
tail -f logs/combined.log

# View only errors
grep ERROR logs/error.log

# Count downloads
grep "Download berhasil" logs/combined.log | wc -l
```

## 🔒 Security

- ✅ User ID whitelist (optional)
- ✅ Input validation & sanitization
- ✅ No hardcoded secrets (use .env)
- ✅ Secure header handling untuk CDN bypass
- ✅ Process isolation per download

## 📝 Logs

Logs disimpan di `logs/`:
- `combined.log` - All logs
- `error.log` - Only errors

Log format:
```
2024-03-08 14:30:45 [INFO] Message here
2024-03-08 14:30:46 [ERROR] Error message { context data }
```

## 🚢 Deployment

### Heroku
```bash
heroku create video-downloader-bot
git push heroku main
heroku config:set BOT_TOKEN=your_token
heroku ps:scale worker=1
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN apk add yt-dlp
COPY . .
CMD ["npm", "start"]
```

### VPS/Ubuntu
```bash
sudo apt-get install yt-dlp
npm install -g pm2
pm2 start index.js --name "video-bot"
pm2 startup
```

## 📄 License

MIT

## 🙋 Support

Untuk issues dan questions, buat GitHub issue atau tanya di group Telegram.

---

**Last Updated:** March 2024  
**Version:** 1.0.0
