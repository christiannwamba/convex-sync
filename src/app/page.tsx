"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FormEvent, useState } from "react";

export default function Home() {
  const messages = useQuery(api.messages.list);
  const sendMessage = useMutation(api.messages.send);
  const [newMessageText, setNewMessageText] = useState("");
  const [author, setAuthor] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newMessageText.trim() && author.trim()) {
      await sendMessage({ text: newMessageText, author: author });
      setNewMessageText("");
    }
  };

  return (
    <div className="min-h-screen p-8 font-sans">
      <main className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Convex + Next.js Hello World
        </h1>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Send a Message</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
            <div>
              <input
                type="text"
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                placeholder="Type your message..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Send Message
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
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
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="font-semibold text-blue-600 dark:text-blue-400">
                    {message.author}
                  </div>
                  <div className="text-gray-700 dark:text-gray-300 mt-1">
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

        <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Setup Instructions:</strong>
          </p>
          <ol className="list-decimal list-inside mt-2 text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
            <li>Run `npx convex dev` in your terminal</li>
            <li>Follow the prompts to log in with GitHub</li>
            <li>Create a new project when prompted</li>
            <li>The Convex URL will be automatically saved to .env.local</li>
            <li>Keep the terminal running to sync with Convex</li>
          </ol>
        </div>
      </main>
    </div>
  );
}