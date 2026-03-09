# Deployment Guide

Panduan lengkap untuk deploy Video Downloader Bot ke berbagai environment.

## Prerequisites

- Node.js >= 18.0.0
- yt-dlp installed on server
- Telegram Bot Token
- Valid `BOT_TOKEN` dan konfigurasi lainnya

## Local Development

```bash
npm install
npm run dev
```

## VPS / Ubuntu Server

### 1. Setup System

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install yt-dlp
sudo apt install -y yt-dlp

# Create app directory
mkdir -p /opt/video-downloader-bot
cd /opt/video-downloader-bot
```

### 2. Install Application

```bash
# Copy files
git clone <repo> .
npm install --omit=dev

# Setup environment
cp .env.example .env
# Edit .env dengan credentials
nano .env
```

### 3. Create Systemd Service

```bash
sudo tee /etc/systemd/system/video-bot.service > /dev/null << 'SVCEOF'
[Unit]
Description=Video Downloader Bot
After=network.target

[Service]
Type=simple
User=bot
WorkingDirectory=/opt/video-downloader-bot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/video-bot/bot.log
StandardError=append:/var/log/video-bot/error.log

[Install]
WantedBy=multi-user.target
SVCEOF

# Create bot user dan log directory
sudo useradd -r -s /bin/false bot
sudo mkdir -p /var/log/video-bot
sudo chown bot:bot /var/log/video-bot /opt/video-downloader-bot

# Start service
sudo systemctl daemon-reload
sudo systemctl enable video-bot
sudo systemctl start video-bot
sudo systemctl status video-bot
```

### 4. Monitor Logs

```bash
# Real-time logs
sudo journalctl -u video-bot -f

# Or from file
tail -f /var/log/video-bot/bot.log
```

## Docker Deployment

### Create Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install yt-dlp
RUN apk add --no-cache yt-dlp

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Create logs directory
RUN mkdir -p logs

# Run bot
CMD ["node", "index.js"]
```

### Build & Run

```bash
# Build image
docker build -t video-downloader-bot:1.0 .

# Run container
docker run -d \
  --name video-bot \
  -e BOT_TOKEN=your_token \
  -e LOG_LEVEL=info \
  -v /data/downloads:/app/Downloads \
  -v /data/bot-state:/app/logs \
  --restart unless-stopped \
  video-downloader-bot:1.0

# View logs
docker logs -f video-bot
```

## Docker Compose

```yaml
version: '3.8'

services:
  video-bot:
    build: .
    environment:
      BOT_TOKEN: ${BOT_TOKEN}
      ALLOWED_USER_IDS: ${ALLOWED_USER_IDS}
      MAX_WORKERS: 5
      LOG_LEVEL: info
    volumes:
      - ./Downloads:/app/Downloads
      - ./logs:/app/logs
      - ./bot_state.json:/app/bot_state.json
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Run with:
```bash
docker-compose up -d
docker-compose logs -f
```

## Heroku Deployment

### Setup

```bash
heroku create video-downloader-bot
heroku buildpacks:add heroku/nodejs
```

### Add Buildpack for yt-dlp

Create `Procfile`:
```
worker: npm start
```

Create `buildpacks` file:
```
https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git
heroku/nodejs
```

### Configure

```bash
heroku config:set BOT_TOKEN=your_token
heroku config:set MAX_WORKERS=2
heroku ps:scale worker=1
```

### Deploy

```bash
git push heroku main
heroku logs -f
```

## Environment Variables for Production

```env
# Required
BOT_TOKEN=your_token_here

# Recommended for production
LOG_LEVEL=warn
MAX_WORKERS=3
MAX_QUEUE_SIZE=50
TIMEOUT=60
CLEANUP_DAYS=7

# Optional
ALLOWED_USER_IDS=user_id_1,user_id_2
```

## Health Checks

### Monitor bot status

```bash
# Check if process running
ps aux | grep "node index.js"

# Check logs for errors
grep ERROR logs/error.log

# Count successful downloads
grep "Download berhasil" logs/combined.log | wc -l
```

### Restart bot

```bash
# Systemd
sudo systemctl restart video-bot

# Docker
docker restart video-bot

# Docker Compose
docker-compose restart video-bot
```

## Troubleshooting

### Bot not starting
```bash
# Check logs
sudo journalctl -u video-bot --no-pager -n 50

# Verify configuration
cat /opt/video-downloader-bot/.env

# Check yt-dlp
yt-dlp --version
```

### Out of disk space
```bash
# Check disk usage
du -sh Downloads/

# Cleanup old files
find Downloads/ -mtime +7 -delete

# Or adjust CLEANUP_DAYS
```

### High memory usage
```bash
# Reduce MAX_WORKERS
# Edit .env: MAX_WORKERS=2

# Restart bot
sudo systemctl restart video-bot
```

## Performance Tuning

### For heavy usage (>50 downloads/day)
```env
MAX_WORKERS=5
MAX_QUEUE_SIZE=200
PROGRESS_THROTTLE=2
```

### For light usage (<10 downloads/day)
```env
MAX_WORKERS=2
MAX_QUEUE_SIZE=50
CLEANUP_DAYS=14
```

## Backup

### Backup important files
```bash
# Backup state & logs
tar -czf backup_$(date +%Y%m%d).tar.gz \
  bot_state.json \
  logs/
```

### Restore
```bash
tar -xzf backup_20240308.tar.gz
```

## Updates

### Update to latest version
```bash
cd /opt/video-downloader-bot
git pull origin main
npm install --omit=dev
sudo systemctl restart video-bot
```

---

**Last Updated:** March 2024
