"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FormEvent, useState } from "react";

export default function Home() {
  const messages = useQuery(api.messages.list);
  const sendMessage = useMutation(api.messages.send);
  const initiateOAuth = useAction(api.oauth.initiateGoogleOAuth);
  
  const [newMessageText, setNewMessageText] = useState("");
  const [author, setAuthor] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newMessageText.trim() && author.trim()) {
      await sendMessage({ text: newMessageText, author: author });
      setNewMessageText("");
    }
  };

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
      <main className="max-w-4xl mx-auto">
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

        {/* Original Messages Section */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Send a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Send Message
              </button>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Messages</h2>
            {messages === undefined ? (
              <div className="text-gray-500 text-center py-8">
                <p>Connecting to Convex...</p>
                <p className="text-sm mt-2">
                  Make sure to run: npx convex dev
                </p>
              </div>
            ) : messages.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No messages yet. Be the first to send one!
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message._id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="font-semibold text-blue-600">
                      {message.author}
                    </div>
                    <div className="text-gray-700 mt-1">
                      {message.text}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {new Date(message._creationTime).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
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