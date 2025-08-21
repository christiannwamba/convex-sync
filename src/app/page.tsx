"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const initiateOAuth = useAction(api.oauth.initiateGoogleOAuth);

  const [userEmail, setUserEmail] = useState("");
  const [isCheckingUser, setIsCheckingUser] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Check user existence when email is entered
  const userExists = useQuery(
    api.oauth.checkUserExists,
    userEmail.includes('@') ? { email: userEmail.trim() } : "skip"
  );

  const handleGoogleAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!userEmail.trim()) return;

    const email = userEmail.trim();

    // Check if user exists and is authenticated
    if (userExists?.exists && userExists?.isAuthenticated) {
      // User exists and is authenticated, redirect to dashboard
      router.push(`/dashboard?email=${encodeURIComponent(email)}`);
      return;
    }

    // If user doesn't exist or isn't authenticated, proceed with OAuth
    setIsAuthenticating(true);
    try {
      const result = await initiateOAuth({ userEmail: email });
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
    <div className="min-h-screen p-8 bg-background">
      <main className="max-w-2xl mx-auto">
        <h1 className="text-5xl font-heading font-bold mb-8 text-center text-foreground">
          Google Calendar Sync
        </h1>

        {/* Google Calendar Authentication */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">Connect Google Calendar</CardTitle>
            <CardDescription>
              Enter your email and connect to Google Calendar to start syncing your events.
            </CardDescription>
          </CardHeader>
          <CardContent>

          <form onSubmit={handleGoogleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-heading mb-2 text-foreground">
                Your Email
              </label>
              <Input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={isAuthenticating}
              className="w-full"
              variant={userExists?.exists && userExists?.isAuthenticated ? "default" : "default"}
              size="lg"
            >
              {isAuthenticating
                ? 'Connecting...'
                : userExists?.exists && userExists?.isAuthenticated
                ? 'Go to Dashboard'
                : 'Connect with Google Calendar'
              }
            </Button>
          </form>

          {/* User status indicator */}
          {userEmail.includes('@') && userExists && (
            <Alert className="mt-4" variant={userExists.exists && userExists.isAuthenticated ? "default" : "default"}>
              {userExists.exists && userExists.isAuthenticated
                ? <CheckCircle2 className="h-4 w-4" />
                : userExists.exists && !userExists.isAuthenticated
                ? <AlertCircle className="h-4 w-4" />
                : <Info className="h-4 w-4" />
              }
              <AlertDescription>
                {userExists.exists && userExists.isAuthenticated
                  ? `Found your account! Click the button above to go to your dashboard.`
                  : userExists.exists && !userExists.isAuthenticated
                  ? `Found your account but tokens expired. Click to re-authenticate.`
                  : `New user detected. Click to connect with Google Calendar.`
                }
              </AlertDescription>
            </Alert>
          )}

          <Alert className="mt-6">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <span className="font-heading font-bold block mb-2">What happens next?</span>
              <ol className="list-decimal list-inside text-sm space-y-1">
                <li>You'll be redirected to Google to authorize access</li>
                <li>We'll securely store your authentication tokens</li>
                <li>You'll be able to sync and view your calendar events</li>
                <li>Your refresh token will be used to keep access up-to-date</li>
              </ol>
            </AlertDescription>
          </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside text-sm space-y-1 text-muted-foreground">
              <li>Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Convex env</li>
              <li>Set up Google OAuth app with redirect URI</li>
              <li>Run `npx convex dev` in your terminal</li>
              <li>Enter your email and connect to Google Calendar</li>
              <li>View your calendar events in the dashboard</li>
            </ol>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
