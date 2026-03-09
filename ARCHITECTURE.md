# Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────┐
│         Telegram User Interface             │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Telegraf Bot (Message Router)              │
│  - Command handlers                         │
│  - Callback handlers                        │
│  - Text message handlers                    │
└──────────────┬──────────────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
    ┌─────────┐  ┌──────────────┐
    │ Handlers│  │ Middleware   │
    ├─────────┤  ├──────────────┤
    │ /start  │  │ Auth check   │
    │ text    │  │ Validation   │
    │ callback│  │ Logging      │
    └────┬────┘  └──────┬───────┘
         │              │
         └──────┬───────┘
                ▼
    ┌─────────────────────────┐
    │   State Management      │
    ├─────────────────────────┤
    │ - StateManager          │
    │ - StorageManager        │
    │ - DownloadQueue         │
    └─────────┬───────────────┘
              │
         ┌────┴────┐
         ▼         ▼
    ┌────────┐ ┌──────────────┐
    │ Memory │ │ Persistence  │
    │ Maps   │ │ (JSON file)  │
    └────────┘ └──────────────┘
         │
    ┌────┴────┐
    ▼         ▼
 ┌─────┐  ┌──────────────┐
 │Queue│  │   Services   │
 └──┬──┘  ├──────────────┤
    │     │- Download    │
    │     │- Storage     │
    │     │- State       │
    │     └──────────────┘
    │
    ▼
┌─────────────────────────┐
│ Worker Pool             │
│ (5 workers parallel)    │
└──────────┬──────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌──────────────┐
│ yt-dlp │  │ Telegram API │
│ Process│  │ (messages)   │
└────────┘  └──────────────┘
```

## Core Components

### 1. Configuration (`src/config/index.js`)
- Centralized environment variable management
- Validation during startup
- Custom getEnv() helpers untuk safe access

**Responsibilities:**
- Load & validate all config
- Provide sensible defaults
- Throw errors for missing required values

### 2. Error Handling (`src/errors/AppError.js`)
Custom error hierarchy:
```
AppError (base)
├── DownloadError
├── ValidationError
├── StorageError
└── ConfigError
```

**Benefits:**
- Easier error categorization
- Better error recovery
- Cleaner error handling in handlers

### 3. Logging (`src/utils/logger.js`)
Winston-based logging dengan:
- Console output (colorized)
- File output (with rotation)
- Configurable log levels

**Usage:**
```javascript
logger.info('message', { metadata });
logger.error('error', { error });
logger.debug('debug info');
```

### 4. State Management

#### StateManager (`src/services/StateManager.js`)
- Tracks processed links (Set)
- Stores folder history per user (Map)
- Maintains download statistics

**Key Methods:**
- `loadState()` - Load from JSON file
- `saveState()` - Save to JSON file
- `addProcessedLink(url)` - Add to processed set
- `isProcessed(url)` - Check if link processed
- `updateStats(updates)` - Update statistics

#### StorageManager (`src/services/StorageManager.js`)
- Manage download folders
- Handle folder history
- Cleanup old files

**Key Methods:**
- `initialize(dir)` - Initialize download directory
- `applyDownloadDir(dir, chatId)` - Change folder
- `getFolderHistory(chatId)` - Get user's folder history
- `cleanupOldFiles(days)` - Delete files older than N days

### 5. Queue System

#### AsyncQueue (`src/workers/AsyncQueue.js`)
Simple async queue implementation:
```javascript
queue = new AsyncQueue(maxSize=100)
queue.put(item)  // Returns boolean
item = await queue.get()  // Awaits if empty
```

**Features:**
- Non-blocking put (returns false if full)
- Blocking get (waits for item)
- Size tracking & capacity check

### 6. Download Service (`src/services/DownloadService.js`)
Handles video downloads using `yt-dlp`:

**Process:**
1. Spawn yt-dlp child process
2. Parse progress from stdout/stderr
3. Send real-time updates via callback
4. Handle completion & errors
5. Retry with exponential backoff

**Retry Strategy:**
- Attempt 1: immediate
- Attempt 2: 2 second delay
- Attempt 3: 4 second delay (2^2)
- Max 3 attempts (configurable)

### 7. Message Handlers

#### Callback Handlers (`src/handlers/callbacks.js`)
Route all inline button presses:
- Menu navigation
- Statistics & queue view
- Cache management
- Folder selection

#### Text Handlers (to be implemented)
Handle user messages:
- Link extraction & validation
- Folder selection prompts
- Cache removal commands

#### Authentication (`src/handlers/auth.js`)
Middleware untuk user authorization:
- Check ALLOWED_USER_IDS
- Deny access if not whitelisted
- Log unauthorized attempts

### 8. Utilities

#### Validators (`src/utils/validators.js`)
- `sanitizeFilename()` - Remove invalid chars
- `sanitizeFoldername()` - Clean folder names
- `isValidUrl()` - URL format validation
- `isValidChatId()` - Chat ID validation

#### Helpers (`src/utils/helpers.js`)
- `extractLinks()` - Parse URLs from text
- `normalizeDir()` - Normalize directory paths
- `formatDuration()` - Human readable durations
- `getReferer()` - Get appropriate referer header
- `getSpinner()` - Spinner animation frames

#### Formatters (`src/utils/formatters.js`)
- Format queue results
- Format progress bars
- Format status messages

### 9. Message Templates (`src/messages/templates.js`)
Pre-built message templates untuk consistency:
- `templates.home()` - Main menu
- `templates.stats()` - Statistics page
- `templates.queue()` - Queue status
- `templates.help()` - Help/guide
- etc.

## Data Flow

### Download Flow
```
User sends URL
    ↓
Handler extracts link
    ↓
Check if processed (skip if yes)
    ↓
Ask for folder
    ↓
Add to queue
    ↓
Worker picks from queue
    ↓
Call DownloadService.downloadVideo()
    ↓
Track progress & send updates
    ↓
On success: Save state, notify user
    ↓
On failure: Retry with backoff
    ↓
Max retries reached: Notify failure
```

### State Persistence
```
Memory (Runtime)
├── processedLinks (Set)
├── folderHistory (Map)
├── downloadStats (Object)
└── activeDownloads (Map)
         ↓
    Save to disk (JSON)
         ↓
    bot_state.json
```

When bot restarts:
```
Load from bot_state.json
    ↓
Restore to memory
    ↓
Resume with previous state
```

## Worker Pool Architecture

```
Main Thread
    ├── Telegram event listener
    ├── Queue manager
    └── State persistence
         │
         └─► Worker Pool (5 workers)
              ├── Worker-1 ──► yt-dlp
              ├── Worker-2 ──► yt-dlp
              ├── Worker-3 ──► yt-dlp
              ├── Worker-4 ──► yt-dlp
              └── Worker-5 ──► yt-dlp
```

**Benefits:**
- Non-blocking main thread
- Parallel downloads (up to 5)
- Graceful queue processing
- Isolated error handling per worker

## Error Recovery

```
Error occurs in worker
    ↓
Log error with context
    ↓
Check error type
    ├─► DownloadError (network issue)
    │   └─ Retry with backoff
    ├─► ValidationError (invalid input)
    │   └─ Notify user, skip
    ├─► StorageError (disk full)
    │   └─ Log critical, notify user
    └─► Unexpected error
        └─ Log & cleanup
```

## Security Model

1. **Authentication:**
   - ALLOWED_USER_IDS whitelist
   - Checked per message

2. **Input Validation:**
   - URL format check
   - Filename sanitization
   - Folder name sanitization

3. **Resource Protection:**
   - Queue size limit (prevent DOS)
   - Max workers limit
   - File size check (min 1KB)

4. **Secret Management:**
   - BOT_TOKEN dari .env
   - No hardcoded values
   - .env in .gitignore

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Add to queue | ~1ms | O(1) |
| Download start | ~500ms | Spawn process |
| Progress update | ~100ms | Via Telegram API |
| State save | ~10ms | Disk I/O |
| State load | ~20ms | Startup |

## Scalability Considerations

**Current Limitations:**
- Single machine only
- JSON state (no concurrent access)
- 5 workers max realistic

**For future scaling:**
1. Migrate to database (PostgreSQL)
2. Use Redis untuk queue
3. Distributed worker setup
4. Load balancing

## Testing Strategy

Unit tests cover:
- ✅ Validators & formatters
- ✅ Queue operations
- ✅ State management
- ✅ Helper functions

Missing (future):
- Integration tests (with mock bot)
- End-to-end tests
- Load tests

---

**Last Updated:** March 2024
