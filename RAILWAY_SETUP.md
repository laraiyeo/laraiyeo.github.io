# Railway Deployment Guide - Sports Tracker Backend

## Why Railway is Perfect for Your Project

Railway's free tier gives you exactly what you need:
- ✅ **Node.js backend service** (your API server)
- ✅ **Redis database service** (for caching)  
- ✅ **Automatic scaling** within limits
- ✅ **Built-in environment variables**
- ✅ **HTTPS endpoints**

## Step-by-Step Deployment

### 1. Prepare Your Code

First, make sure your backend is ready:

```bash
# In your backend directory
git add .
git commit -m "Prepare backend for Railway deployment"
git push origin main
```

### 2. Sign Up for Railway

1. Go to https://railway.app
2. Sign up with GitHub (easiest)
3. Connect your GitHub account

### 3. Create New Project

1. Click "Deploy from GitHub"
2. Select your `live-sports-tracker` repository
3. Choose the `backend` folder as root

### 4. Add Redis Database

1. In your Railway project dashboard
2. Click "Add Service"
3. Select "Database" → "Add Redis"
4. Railway automatically creates Redis and sets `REDIS_URL`

### 5. Configure Environment Variables

Railway will auto-detect your Node.js app, but you need to add:

```bash
NODE_ENV=production
PORT=3001
# REDIS_URL is automatically set by Railway
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your-email@example.com
```

### 6. Deploy!

Railway automatically:
- Builds your Node.js app
- Starts Redis database
- Provides HTTPS URLs
- Sets up internal networking

## Expected URLs

After deployment, you'll get:
- **API URL**: `https://your-project-name.railway.app`
- **Health Check**: `https://your-project-name.railway.app/health`
- **Favorites API**: `https://your-project-name.railway.app/api/favorites/...`

## Update Mobile App

Update your `BackendApiService.js`:

```javascript
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api' 
  : 'https://your-project-name.railway.app/api';
```

## Resource Usage Monitoring

Railway provides dashboard to monitor:
- CPU usage (should be low)
- Memory usage (should stay under 0.5GB)
- Network bandwidth
- Database IOPS

## Free Tier Limits

You're well within limits:
- **Bandwidth**: Sports data APIs use minimal bandwidth
- **CPU**: API requests are lightweight  
- **RAM**: 0.5GB is plenty for your use case
- **Database**: 3000 IOPS perfect for Redis caching

## Troubleshooting

### If Deployment Fails:
1. Check Railway logs in dashboard
2. Ensure `package.json` has correct start script
3. Verify environment variables are set

### If Redis Connection Fails:
1. Railway sets `REDIS_URL` automatically
2. Check your `cacheService.js` uses `process.env.REDIS_URL`
3. Verify Redis service is running in dashboard

## Advantages Over Render

1. **Two services included** (backend + Redis)
2. **No external dependencies** needed
3. **Simple setup** - just connect and deploy
4. **Built-in Redis** - no need for external providers
5. **Room to grow** - 3rd service slot available

## Cost Scaling

If you exceed free tier (unlikely for personal use):
- Railway charges $0.000463 per GB-hour for compute
- $0.25 per GB for database storage
- Very reasonable for small applications

This is perfect for your sports tracker backend!