import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/?error=missing_parameters', request.url)
    );
  }

  try {
    // Complete OAuth flow through Convex
    const result = await convex.action(api.oauth.completeOAuthFlow, {
      code,
      state,
    });

    if (result.success) {
      // Redirect to dashboard with success
      return NextResponse.redirect(
        new URL(`/dashboard?email=${encodeURIComponent(result.email)}`, request.url)
      );
    } else {
      return NextResponse.redirect(
        new URL('/?error=oauth_failed', request.url)
      );
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(`/?error=oauth_error&message=${encodeURIComponent(
        error instanceof Error ? error.message : 'Unknown error'
      )}`, request.url)
    );
  }
}