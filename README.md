# SEO Keyword Research Client

A React web application for triggering SEO keyword research via n8n webhook.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your webhook URL:
```bash
cp .env.example .env
```

3. Edit `.env` and add your n8n webhook URL:
```
VITE_WEBHOOK_URL=https://your-n8n-instance.com/webhook/seo-keyword-research
```

## Development

Run the development server:
```bash
npm run dev
```

## Build

Build for production:
```bash
npm run build
```

## Deployment

### Vercel
1. Push to GitHub
2. Import project in Vercel
3. Add environment variable: `VITE_WEBHOOK_URL`
4. Deploy

### Netlify
1. Push to GitHub
2. Import project in Netlify
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add environment variable: `VITE_WEBHOOK_URL`
6. Deploy
