"use client";

import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FormEvent, useState } from "react";

export default function Home() {
  const initiateOAuth = useAction(api.oauth.initiateGoogleOAuth);
  
  const [userEmail, setUserEmail] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleGoogleAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!userEmail.trim()) return;

    setIsAuthenticating(true);
    try {
      const result = await initiateOAuth({ userEmail: userEmail.trim() });
      // Redirect to Google OAuth
      window.location.href = result.oauthUrl;
    } catch (error) {
      console.error('OAuth initiation failed:', error);
      alert('Failed to start authentication. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen p-8 font-sans bg-gray-50">
      <main className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Google Calendar Sync
        </h1>

        {/* Google Calendar Authentication */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Connect Google Calendar</h2>
          <p className="text-gray-600 mb-6">
            Enter your email and connect to Google Calendar to start syncing your events.
          </p>
          
          <form onSubmit={handleGoogleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Email
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isAuthenticating}
              className={`w-full font-medium py-3 px-4 rounded-lg transition-colors ${
                isAuthenticating
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isAuthenticating ? 'Connecting...' : 'Connect with Google Calendar'}
            </button>
          </form>
          
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
            <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
              <li>You'll be redirected to Google to authorize access</li>
              <li>We'll securely store your authentication tokens</li>
              <li>You'll be able to sync and view your calendar events</li>
              <li>Your refresh token will be used to keep access up-to-date</li>
            </ol>
          </div>
        </div>

        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Setup Instructions:</strong>
          </p>
          <ol className="list-decimal list-inside mt-2 text-sm text-yellow-700 space-y-1">
            <li>Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Convex env</li>
            <li>Set up Google OAuth app with redirect URI: {process.env.NEXT_PUBLIC_CONVEX_URL || "your-convex-url"}/api/oauth/callback</li>
            <li>Run `npx convex dev` in your terminal</li>
            <li>Enter your email and connect to Google Calendar</li>
            <li>View your calendar events in the dashboard</li>
          </ol>
        </div>
      </main>
    </div>
  );
}