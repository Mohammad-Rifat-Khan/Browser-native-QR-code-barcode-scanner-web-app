# Browser Scanner App

Mobile-first scanner web app for QR code and EAN-13 with real-time history sync.

This setup targets maximum production-grade deployment:

- **Frontend & Backend**: EC2 (Ubuntu 22.04 or latest)
- **Database**: AWS RDS PostgreSQL
- **Runtime**: Node.js with Docker containerization
- **Reverse Proxy**: NGINX for static frontend + API/WebSocket proxying
- **Real-time Sync**: Socket.IO WebSockets

## Stack

- **Frontend**: React 19 + Vite (JavaScript) + html5-qrcode
- **Backend**: Node.js + Express 5 + Socket.IO 4
- **Database**: AWS RDS PostgreSQL with connection pooling
- **Containerization**: Docker + docker-compose
- **Styling**: CSS with dark/light theme support, mobile-first responsive design

## Features

- Browser-native camera scanning (WebRTC)
- QR code and EAN-13 support
- Manual fallback input when camera permission is denied
- Real-time history sync via Socket.IO WebSockets
- Search and filter history by barcode value and type
- Export scan history as CSV (with timestamp, device info, duplicate flag)
- Barcode type detection and labeling (QR_CODE, EAN_13, MANUAL)
- Duplicate detection (within 5-second window)
- Dark/light theme toggle
- Copy-to-clipboard for individual scan results
- Device info capture (browser, OS, platform)
- Responsive mobile-first design
- Health check endpoint for monitoring
- Graceful error handling and shutdown

## Project Structure

```
client/                      # React frontend (Vite)
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── App.css
├── vite.config.js
├── eslint.config.js
└── package.json

server/                      # Node.js backend (Express)
├── src/
│   ├── index.js            # Express server + Socket.IO
│   └── db.js               # PostgreSQL pool + schema init
├── sql/
│   └── schema.sql          # DDL: scans table + indexes
├── Dockerfile
├── package.json
└── .env.example

docker-compose.yml           # Production stack (NGINX + backend + RDS)
nginx.conf                   # NGINX reverse proxy config
.gitignore
LICENSE
README.md
```

## Environment Setup

### Backend `.env`

Copy `server/.env.example` to `server/.env`:

```env
# PostgreSQL connection string
# Local dev: Use docker-compose PostgreSQL service
# Production: Use AWS RDS endpoint
DATABASE_URL=postgresql://user:password@localhost:5432/scanner

# CORS origins (comma-separated)
CORS_ORIGIN=http://localhost:5173,https://your-domain.com

# Server port
PORT=4000

# Optional: Socket.IO logging
DEBUG=socket.io:*
```

**For AWS RDS**:
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@your-rds-endpoint.rds.amazonaws.com:5432/scanner
```

### Frontend `.env.local` (local dev)

```env
VITE_API_BASE_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

**For EC2 production**:
```env
VITE_API_BASE_URL=https://your-ec2-domain.com
VITE_SOCKET_URL=https://your-ec2-domain.com
```

## Local Development

### Manual Node.js (Recommended for Development)

1. **Install dependencies**
   ```bash
   cd client && npm install
   cd ../server && npm install
   ```

2. **Set up PostgreSQL locally** (or use Docker just for the database)
   ```bash
   docker run --name scanner-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
   ```

3. **Configure `.env` files**
   ```bash
   cp server/.env.example server/.env
   ```

4. **Start backend**
   ```bash
   cd server
   npm run dev    # Uses nodemon for auto-reload
   ```

5. **Start frontend** (new terminal)
   ```bash
   cd client
   npm run dev
   ```

Frontend available at http://localhost:5173  
Backend API at http://localhost:4000

## Production Deployment (EC2 + AWS RDS)

### Prerequisites

- EC2 instance (Ubuntu 22.04+, t3.micro or larger)
- AWS RDS PostgreSQL instance (publicly accessible or same VPC as EC2)
- Domain name with DNS pointing to EC2 public IP
- SSL certificate (use AWS Certificate Manager or Let's Encrypt via Certbot)

### 1. Prepare EC2 Instance

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose
sudo apt install -y docker.io docker-compose git

# Add ubuntu user to docker group (avoid sudo for docker)
sudo usermod -aG docker ubuntu
newgrp docker

# Clone your repository
git clone https://github.com/your-username/OmniDevX-Studio.git
cd OmniDevX-Studio
```

### 2. Set Up Environment Variables

```bash
# Copy .env template
cp server/.env.example server/.env

# Edit with RDS credentials
nano server/.env
```

Add your RDS details:
```env
DATABASE_URL=postgresql://postgres:your-rds-password@your-rds-endpoint.rds.amazonaws.com:5432/scanner
CORS_ORIGIN=https://your-ec2-domain.com
PORT=4000
```

### 3. Build Frontend for Production

```bash
cd client
npm install
npm run build    # Creates dist/ folder with optimized files

cd ../server
npm install      # Install backend dependencies
```

### 4. Deploy with Docker Compose (Production)

```bash
# Use docker-compose from repository (production setup)
docker-compose up -d

# Verify services are running
docker-compose ps

# Check logs
docker-compose logs -f backend
```

**What this does:**
- NGINX listens on ports 80/443
- Reverse proxies `/` to static frontend (dist/)
- Proxies `/api/*` and `/socket.io/*` to backend service
- Backend connects to AWS RDS PostgreSQL
- Auto-initializes database schema on startup

### 5. Set Up SSL (Certbot + Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate (requires DNS to point to EC2)
sudo certbot certonly --standalone -d your-ec2-domain.com

# Certificate path: /etc/letsencrypt/live/your-ec2-domain.com/

# Update nginx.conf with certificate paths, then restart
docker-compose restart nginx
```

### 6. Connection String Testing

Verify backend can reach RDS:

```bash
# Inside running backend container
docker exec -it omnidevx-backend-1 npm run test
# Or manually test: psql $DATABASE_URL -c "SELECT 1"
```

### Monitoring & Logs

```bash
# View all service logs
docker-compose logs -f

# Health check
curl https://your-ec2-domain.com/api/health

# Access frontend
https://your-ec2-domain.com
```

### Scaling Notes

- Connection pooling is configured (max 20 connections per pod)
- RDS should be configured with at least `db.t3.micro` for this workload
- NGINX handles load balancing; add more backend replicas in compose file if needed
- Consider CloudFront CDN for frontend assets

## Development Scripts

**Frontend** (`client/`):
```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
npm run lint     # Run ESLint
```

**Backend** (`server/`):
```bash
npm run dev      # Start with nodemon (auto-reload on file changes)
npm start        # Start production server
npm run lint     # Run syntax checks
```

**Docker**:
```bash
# Production (NGINX + backend + RDS)
docker-compose up -d
docker-compose logs -f
docker-compose down
```

## Features & How to Use

### Scanner & Manual Entry
- Click **Start camera** to begin scanning
- Point at QR codes or EAN-13 barcodes for instant capture
- Use **Manual Entry** form if camera is unavailable
- Results sync across all connected clients in real-time

### History Management
- **Search**: Filter scans by value (ILIKE pattern matching)
- **Type Filter**: View QR codes, EAN-13, or manual entries separately
- **Copy-to-Clipboard**: Click the 📋 icon on any scan to copy its value
- **Export as CSV**: Download all visible scans as `scan_history_YYYY-MM-DD.csv`
  - Includes: value, type, timestamp, browser, platform, duplicate status
  - Useful for analytics, auditing, or integration with external tools

### Theme
- Click 🌙 (or ☀️) in the header to toggle between dark and light modes
- Preference persists while browsing

## API Endpoints

### REST API

**GET /api/health**
- Health check endpoint for monitoring
- Returns: `{ "ok": true, "service": "scanner-api" }`

**GET /api/scans**
- Fetch scan history with optional filtering
- Query params:
  - `search` (string): Search scan values (ILIKE)
  - `type` (string): Filter by type (QR_CODE, EAN_13, MANUAL)
- Returns: Array of scans (max 200, ordered by timestamp DESC)

**POST /api/scans**
- Create a new scan entry
- Body:
  ```json
  {
    "value": "barcode_or_qr_value",
    "type": "QR_CODE|EAN_13|MANUAL",
    "deviceInfo": { "source": "camera" }  // optional
  }
  ```
- Returns: Created scan object with id, timestamp, duplicate flag

### WebSocket Events

**`scan:created`** (server → client)
- Emitted when any client creates a scan
- Payload: Complete scan object
- Used for real-time history updates

All WebSocket events are routed through Socket.IO namespace `/`

## Mobile & Browser Support

- ✅ iOS Safari 14+: WebRTC camera access supported
- ✅ Android Chrome: Full support
- ✅ Android Firefox: Full support
- ⚠️ iOS WebView: Camera access may be restricted; manual input fallback available
- 🔒 HTTPS required in production for camera access (browser security policy)

### Testing

- Use real devices or browser DevTools device emulation
- Test camera permission prompts on actual target platforms
- Verify fallback manual input works when camera is denied
- Check dark mode toggle on each target platform

## Architecture Decisions

**Why Docker?**
- Consistent environment (local dev = production)
- Easy horizontal scaling
- Simplified deployment to EC2

**Why Socket.IO (not REST polling)?**
- Real-time scan history updates across clients
- Persistent WebSocket connection required (can't use serverless)
- Low latency for live scanning scenarios

**Why PostgreSQL (not Supabase SDK)?**
- Direct control over queries
- Better performance with connection pooling
- Simpler deployment (RDS setup vs managed services)
- Aligns with AWS infrastructure scoring

**Why NGINX reverse proxy?**
- Single entry point for frontend + API + WebSockets
- SSL termination
- Static file serving with caching
- Can add load balancing for multiple backend instances

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For issues or questions, open a GitHub issue in this repository.
