# Google Calendar Sync Setup Instructions

This application provides a simple Google Calendar sync implementation using Convex backend and Next.js frontend.

## Features

- ✅ OAuth 2.0 flow with PKCE for secure authentication
- ✅ Automatic access token refresh using stored refresh tokens
- ✅ Calendar events fetching and storage in Convex database
- ✅ Web-standard APIs (fetch) compatible with Convex runtime
- ✅ TypeScript implementation with proper type safety
- ✅ User-friendly dashboard for viewing calendar events

## Setup Steps

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     ```
     http://localhost:3000/api/oauth/callback
     ```
     (Replace with your actual domain in production)

### 2. Environment Variables

Update your Convex environment variables with your Google OAuth credentials:

```bash
# Replace with your actual Google OAuth credentials
npx convex env set GOOGLE_CLIENT_ID your-google-client-id
npx convex env set GOOGLE_CLIENT_SECRET your-google-client-secret

# Make sure SITE_URL is set correctly
npx convex env set SITE_URL http://localhost:3000
```

### 3. Start Development

1. Start Convex development server:
   ```bash
   npx convex dev
   ```

2. In a separate terminal, start Next.js:
   ```bash
   pnpm run dev
   ```

3. Open http://localhost:3000 in your browser

### 4. Test the Flow

1. Enter your email address on the home page
2. Click "Connect with Google Calendar"
3. Complete the Google OAuth flow
4. You'll be redirected to the dashboard
5. Click "Sync Now" to fetch your calendar events
6. View your synced events in the dashboard

## Architecture Overview

### Backend (Convex)

- **`schema.ts`**: Database schema with users, calendar events, and OAuth sessions
- **`oauth.ts`**: OAuth flow actions (initiate, complete, refresh tokens)
- **`oauthQueries.ts`**: Database queries for OAuth data
- **`calendar.ts`**: Google Calendar API actions with token management
- **`calendarQueries.ts`**: Database queries for calendar events

### Frontend (Next.js)

- **`src/app/page.tsx`**: Home page with OAuth initiation
- **`src/app/dashboard/page.tsx`**: Dashboard for viewing calendar events
- **`src/app/api/oauth/callback/route.ts`**: OAuth callback handler

## Key Implementation Details

### OAuth Flow
1. **Initiate**: Generate PKCE parameters and redirect to Google
2. **Callback**: Exchange authorization code for tokens
3. **Storage**: Securely store access and refresh tokens in Convex database
4. **Refresh**: Automatically refresh expired tokens before API calls

### Token Management
- Access tokens are automatically refreshed when expired (5 min buffer)
- Refresh tokens are stored securely in the database
- All Google API calls go through the `makeAuthenticatedGoogleRequest` utility

### Calendar Sync
- Fetches events from primary Google Calendar
- Stores events with deduplication based on Google event ID
- Supports both date-time and all-day events
- Includes event details like summary, description, location

## Security Features

- PKCE (Proof Key for Code Exchange) for OAuth flow
- Secure token storage in Convex database
- Automatic token refresh to minimize exposure
- Input validation and error handling

## Production Deployment

1. Update environment variables for production:
   ```bash
   npx convex env set GOOGLE_CLIENT_ID your-prod-client-id --prod
   npx convex env set GOOGLE_CLIENT_SECRET your-prod-client-secret --prod
   npx convex env set SITE_URL https://your-domain.com --prod
   ```

2. Update Google OAuth app redirect URIs to include your production domain

3. Deploy with your preferred hosting platform (Vercel, etc.)

## Troubleshooting

### Common Issues

1. **"Invalid OAuth state" error**: Check that your redirect URI matches exactly in Google Console

2. **"Token refresh failed" error**: Verify your client secret is correct

3. **"Failed to fetch calendar events" error**: Ensure the Google Calendar API is enabled

4. **TypeScript errors**: Run `npx convex dev` to regenerate types

### Debug Mode

Add console logging to track OAuth flow:
```typescript
console.log('OAuth URL:', result.oauthUrl);
console.log('Token response:', tokens);
```

## Limitations

- Currently only supports read access to primary calendar
- Limited to 100 events per sync
- No real-time updates (manual sync required)

## Next Steps

Potential enhancements:
- Support for multiple calendars
- Real-time event updates via webhooks  
- Event creation/modification capabilities
- Recurring event handling
- Calendar sharing features