'use client';

import { useQuery, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, RefreshCw, LogOut, Home, Calendar, MapPin, Clock } from 'lucide-react';

interface CalendarEvent {
  _id: string;
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
  lastSyncedAt: number;
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get('email');
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const authStatus = useQuery(api.calendar.getUserAuthStatus,
    email ? { email } : "skip"
  );

  const calendarEvents = useQuery(api.calendar.getUserCalendarEventsByEmail,
    email ? { email, limit: 20 } : "skip"
  );

  const syncCalendar = useAction(api.calendar.refreshUserCalendar);
  const deleteUserData = useAction(api.oauth.deleteAllUserData);

  const handleSync = async () => {
    if (!email) return;

    setIsLoading(true);
    setSyncStatus('Syncing calendar events...');

    try {
      const result = await syncCalendar({ userEmail: email });

      if (result.success) {
        setSyncStatus(`Successfully initiated sync!`);
      } else {
        setSyncStatus(`Sync failed: ${result.message}`);
      }
    } catch (error) {
      setSyncStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!email) return;

    setIsLoggingOut(true);

    try {
      const result = await deleteUserData({ email });
      
      if (result.success) {
        // Redirect to homepage after successful logout
        router.push('/');
      }
    } catch (error) {
      console.error('Logout failed:', error);
      alert(`Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirm(false);
    }
  };

  const formatEventTime = (event: CalendarEvent) => {
    const startTime = event.start.dateTime || event.start.date;
    const endTime = event.end.dateTime || event.end.date;

    if (!startTime) return 'Time TBD';

    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : null;

    if (event.start.date && event.end.date) {
      // All-day event
      return `All day - ${start.toDateString()}`;
    } else {
      // Timed event
      const timeOptions: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      };

      if (end && start.toDateString() !== end.toDateString()) {
        return `${start.toLocaleDateString('en-US', timeOptions)} - ${end.toLocaleDateString('en-US', timeOptions)}`;
      } else {
        return `${start.toLocaleDateString('en-US', timeOptions)} - ${end?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      }
    }
  };

  if (!email) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-2xl">No email provided</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href="/">
                <Home className="w-4 h-4" />
                Back to home
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-heading font-bold text-foreground">Calendar Dashboard</h1>
              <p className="text-muted-foreground mt-1 font-base">Welcome, {email}</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button asChild variant="ghost">
                <a href="/">
                  <Home className="w-4 h-4" />
                  Back to home
                </a>
              </Button>
              {authStatus?.isAuthenticated && (
                <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <LogOut className="w-4 h-4" />
                      Logout & Delete Data
                    </Button>
                  </DialogTrigger>
                </Dialog>
              )}
            </div>
          </div>
        </header>

        {/* Auth Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">Authentication Status</CardTitle>
          </CardHeader>
          <CardContent>
            {authStatus ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  {authStatus.isAuthenticated ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <Badge variant={authStatus.isAuthenticated ? "default" : "secondary"}>
                    {authStatus.isAuthenticated ? 'Connected to Google Calendar' : 'Not connected'}
                  </Badge>
                </div>
                {authStatus.isAuthenticated && authStatus.user && (
                  <div className="text-sm text-muted-foreground space-y-1 font-base">
                    <p>User: {authStatus.user.name || authStatus.user.email}</p>
                    {authStatus.user.tokenExpiresAt && (
                      <p>Token expires: {new Date(authStatus.user.tokenExpiresAt).toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded w-1/4"></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync Controls */}
        {authStatus?.isAuthenticated && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl">Calendar Sync</CardTitle>
                  <CardDescription>Sync your Google Calendar events</CardDescription>
                </div>
                <Button
                  onClick={handleSync}
                  disabled={isLoading}
                  variant="default"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Sync Now
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {syncStatus && (
              <CardContent>
                <Alert>
                  <AlertDescription className="text-sm">
                    {syncStatus}
                  </AlertDescription>
                </Alert>
              </CardContent>
            )}
          </Card>
        )}

        {/* Calendar Events */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Your Calendar Events</CardTitle>
            <CardDescription>Recent events from your Google Calendar</CardDescription>
          </CardHeader>
          <CardContent>
            {calendarEvents === undefined ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : calendarEvents && calendarEvents.length > 0 ? (
              <div className="space-y-4">
                {calendarEvents.map((event) => (
                  <Card key={event._id} className="border-border hover:shadow-shadow-sm transition-all">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-heading font-semibold text-lg text-foreground">{event.summary}</h3>
                          <div className="flex items-center text-sm text-muted-foreground mt-1">
                            <Clock className="w-4 h-4 mr-1" />
                            {formatEventTime(event)}
                          </div>
                          {event.location && (
                            <div className="flex items-center text-sm text-muted-foreground mt-1">
                              <MapPin className="w-4 h-4 mr-1" />
                              {event.location}
                            </div>
                          )}
                          {event.description && (
                            <p className="text-sm text-foreground mt-2 line-clamp-2">{event.description}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground ml-4 space-y-1">
                          <Badge variant="secondary">{event.status}</Badge>
                          <p>Synced: {new Date(event.lastSyncedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-muted-foreground mb-4">
                  <Calendar className="mx-auto h-12 w-12" />
                </div>
                <h3 className="text-lg font-heading font-medium text-foreground mb-2">No events found</h3>
                <p className="text-muted-foreground">
                  {authStatus?.isAuthenticated
                    ? "Try syncing your calendar to fetch events"
                    : "Connect your Google Calendar to see events"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logout Confirmation Modal */}
        <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Logout & Data Deletion</DialogTitle>
              <DialogDescription>
                This will permanently delete all your data including:
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Your user account</li>
                <li>All synced calendar events</li>
                <li>OAuth tokens and sessions</li>
              </ul>
              <Alert variant="destructive">
                <AlertDescription className="text-sm font-bold">
                  This action cannot be undone.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter className="flex space-x-3">
              <Button
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isLoggingOut}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleLogout}
                disabled={isLoggingOut}
                variant="destructive"
                className="flex-1"
              >
                {isLoggingOut ? 'Deleting...' : 'Delete All Data'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
