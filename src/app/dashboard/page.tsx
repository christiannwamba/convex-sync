'use client';

import { useQuery, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

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
  const email = searchParams.get('email');
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const authStatus = useQuery(api.calendar.getUserAuthStatus,
    email ? { email } : "skip"
  );

  const calendarEvents = useQuery(api.calendar.getUserCalendarEventsByEmail,
    email ? { email, limit: 20 } : "skip"
  );

  const syncCalendar = useAction(api.calendar.refreshUserCalendar);

  const handleSync = async () => {
    if (!email) return;

    setIsLoading(true);
    setSyncStatus('Syncing calendar events...');

    try {
      const result = await syncCalendar({ userEmail: email });

      if (result.success) {
        setSyncStatus(`Successfully synced ${result.eventsCount} events!`);
      } else {
        setSyncStatus(`Sync failed: ${result.message}`);
      }
    } catch (error) {
      setSyncStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No email provided</h1>
          <a href="/" className="text-blue-600 hover:text-blue-800">← Back to home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Calendar Dashboard</h1>
              <p className="text-gray-600 mt-1">Welcome, {email}</p>
            </div>
            <a
              href="/"
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              ← Back to home
            </a>
          </div>
        </header>

        {/* Auth Status */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
          {authStatus ? (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-3 h-3 rounded-full ${
                  authStatus.isAuthenticated ? 'bg-green-500' : 'bg-red-500'
                }`}></span>
                <span className={`font-medium ${
                  authStatus.isAuthenticated ? 'text-green-700' : 'text-red-700'
                }`}>
                  {authStatus.isAuthenticated ? 'Connected to Google Calendar' : 'Not connected'}
                </span>
              </div>
              {authStatus.isAuthenticated && authStatus.user && (
                <div className="text-sm text-gray-600 space-y-1">
                  <p>User: {authStatus.user.name || authStatus.user.email}</p>
                  {authStatus.user.tokenExpiresAt && (
                    <p>Token expires: {new Date(authStatus.user.tokenExpiresAt).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            </div>
          )}
        </div>

        {/* Sync Controls */}
        {authStatus?.isAuthenticated && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Calendar Sync</h2>
                <p className="text-gray-600 text-sm mt-1">Sync your Google Calendar events</p>
              </div>
              <button
                onClick={handleSync}
                disabled={isLoading}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  isLoading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isLoading ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
            {syncStatus && (
              <div className={`mt-4 p-3 rounded-md text-sm ${
                syncStatus.includes('Successfully')
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : syncStatus.includes('Error') || syncStatus.includes('failed')
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}>
                {syncStatus}
              </div>
            )}
          </div>
        )}

        {/* Calendar Events */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Your Calendar Events</h2>
            <p className="text-gray-600 text-sm mt-1">Recent events from your Google Calendar</p>
          </div>

          <div className="p-6">
            {calendarEvents === undefined ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : calendarEvents && calendarEvents.length > 0 ? (
              <div className="space-y-4">
                {calendarEvents.map((event) => (
                  <div key={event._id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900">{event.summary}</h3>
                        <p className="text-sm text-gray-600 mt-1">{formatEventTime(event)}</p>
                        {event.location && (
                          <p className="text-sm text-gray-500 mt-1">📍 {event.location}</p>
                        )}
                        {event.description && (
                          <p className="text-sm text-gray-700 mt-2 line-clamp-2">{event.description}</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-gray-400 ml-4">
                        <p>Status: {event.status}</p>
                        <p>Synced: {new Date(event.lastSyncedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No events found</h3>
                <p className="text-gray-500">
                  {authStatus?.isAuthenticated
                    ? "Try syncing your calendar to fetch events"
                    : "Connect your Google Calendar to see events"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
