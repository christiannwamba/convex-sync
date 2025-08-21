// Pure TypeScript helper functions for Google API interactions
// These functions don't use Convex context and can be easily tested

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface GoogleUserInfo {
  email: string;
  name: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  status: string;
}

// Raw Google OAuth token response interface
interface RawGoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
  token_type?: string;
  [key: string]: unknown; // For any other fields Google might add
}

// Raw Google user info response interface
interface RawGoogleUserInfo {
  email: string;
  name: string;
  id?: string;
  verified_email?: boolean;
  picture?: string;
  locale?: string;
  [key: string]: unknown; // For any other fields Google might add
}

// Raw Google calendar event response interface
interface RawGoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
    [key: string]: unknown;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
    [key: string]: unknown;
  };
  location?: string;
  status: string;
  attendees?: unknown[];
  transparency?: string;
  [key: string]: unknown; // For any other fields Google might add
}

/**
 * Clean token response to only include fields we need
 */
function cleanTokenResponse(tokenData: RawGoogleTokenResponse): GoogleTokenResponse {
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
  };
}

/**
 * Exchange OAuth authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const rawTokenData = await tokenResponse.json() as RawGoogleTokenResponse;
  return cleanTokenResponse(rawTokenData);
}

/**
 * Clean user info response to only include fields we need
 */
function cleanUserInfo(userData: RawGoogleUserInfo): GoogleUserInfo {
  return {
    email: userData.email,
    name: userData.name,
  };
}

/**
 * Fetch user information from Google OAuth API
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userInfoResponse.ok) {
    throw new Error('Failed to fetch user info');
  }

  const rawUserData = await userInfoResponse.json() as RawGoogleUserInfo;
  return cleanUserInfo(rawUserData);
}

/**
 * Refresh Google OAuth access token using refresh token
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const rawTokenData = await response.json() as RawGoogleTokenResponse;
  return cleanTokenResponse(rawTokenData);
}

/**
 * Clean calendar event to only include fields we need
 */
function cleanCalendarEvent(event: RawGoogleCalendarEvent): GoogleCalendarEvent {
  return {
    id: event.id,
    summary: event.summary || 'Untitled Event',
    description: event.description,
    start: {
      dateTime: event.start?.dateTime,
      date: event.start?.date,
      timeZone: event.start?.timeZone,
    },
    end: {
      dateTime: event.end?.dateTime,
      date: event.end?.date,
      timeZone: event.end?.timeZone,
    },
    location: event.location,
    status: event.status,
  };
}

/**
 * Fetch calendar events from Google Calendar API
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  options: {
    maxResults?: number;
    timeMin?: string;
  } = {}
): Promise<GoogleCalendarEvent[]> {
  const { maxResults = 50, timeMin = new Date().toISOString() } = options;
  
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('maxResults', maxResults.toString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch calendar events: ${error}`);
  }

  const data = await response.json() as { items?: RawGoogleCalendarEvent[] };
  const rawEvents = data.items || [];
  
  // Clean and return only the fields we care about
  return rawEvents.map(cleanCalendarEvent);
}

/**
 * Make authenticated request to Google API with automatic token refresh
 */
export async function makeAuthenticatedGoogleRequest(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}