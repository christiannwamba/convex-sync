# Google Calendar Sync Architecture

## High-Level Overview

This application syncs Google Calendar events to a Convex database, allowing users to query and view their calendar data efficiently.

## System Flow Diagrams

### 1. Flowchart View

```mermaid
flowchart TB
    subgraph Step1["🔐 Step 1: Authentication"]
        User([👤 User]) -->|Visits App| NextApp[Next.js App]
        NextApp -->|Enters Email| AuthCheck{User Exists?}
        AuthCheck -->|No/Expired| OAuth[Google OAuth]
        AuthCheck -->|Yes + Valid| Dashboard[Dashboard]
        OAuth -->|Authorize| Google[Google Account]
        Google -->|Returns Tokens| ConvexAuth[(Convex DB<br/>Store Tokens)]
    end

    subgraph Step2["📥 Step 2: Sync Events"]
        ConvexAuth -->|Trigger Sync| CalendarAPI[Google Calendar API]
        CalendarAPI -->|Fetch Events| EventData[Calendar Events]
        EventData -->|Store| ConvexEvents[(Convex DB<br/>Calendar Events)]
    end

    subgraph Step3["📊 Step 3: Query & Display"]
        Dashboard -->|Request Events| ConvexQuery[(Convex DB<br/>Query)]
        ConvexQuery -->|Return Events| DisplayEvents[Display Events]
        DisplayEvents -->|View| UserView([👤 User Views Events])
    end

    style Step1 fill:#e1f5fe
    style Step2 fill:#f3e5f5
    style Step3 fill:#e8f5e9
    style User fill:#fff3e0
    style UserView fill:#fff3e0
```

### 2. Sequence Diagram

This sequence diagram shows the temporal order of interactions between components:

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant App as Next.js App
    participant Conv as Convex DB
    participant GOAuth as Google OAuth
    participant GCal as Google Calendar API
    
    rect rgb(225, 245, 254)
        Note over U,GOAuth: Step 1: Authentication
        U->>App: Visit app & enter email
        App->>Conv: Check if user exists
        Conv-->>App: User status
        alt User doesn't exist or tokens expired
            App->>GOAuth: Redirect to OAuth
            U->>GOAuth: Authorize access
            GOAuth-->>App: Return with auth code
            App->>GOAuth: Exchange code for tokens
            GOAuth-->>App: Access & refresh tokens
            App->>Conv: Store tokens in DB
        else User exists with valid tokens
            App->>U: Direct to dashboard
        end
    end
    
    rect rgb(243, 229, 245)
        Note over App,GCal: Step 2: Sync Events
        App->>Conv: Get user tokens
        Conv-->>App: Return tokens
        App->>GCal: Fetch calendar events
        GCal-->>App: Return events array
        loop For each event
            App->>Conv: Store event in DB
            Conv--)U: Real-time update (via subscription)
        end
    end
    
    rect rgb(232, 245, 233)
        Note over U,Conv: Step 3: Query & Display
        U->>App: View dashboard
        App->>Conv: Subscribe to events
        Conv-->>App: Initial events + updates
        App->>U: Display events
        loop Real-time updates
            Conv--)App: Push new/updated events
            App--)U: Update display
        end
    end
```

### 3. Component Diagram (C4 Style)

This component diagram shows the system architecture and relationships:

```mermaid
graph TB
    subgraph "User Layer"
        User[["👤 User<br/>Browser"]]
    end
    
    subgraph "Application Layer"
        NextApp["Next.js Application<br/>━━━━━━━━━━<br/>• Pages & Routes<br/>• OAuth Handler<br/>• UI Components"]
        ConvexClient["Convex Client<br/>━━━━━━━━━━<br/>• Real-time Subscriptions<br/>• Query/Mutation Calls"]
    end
    
    subgraph "Backend Layer"
        ConvexBackend["Convex Backend<br/>━━━━━━━━━━<br/>• Actions & Mutations<br/>• Database Queries<br/>• Token Management"]
        ConvexDB[("Convex Database<br/>━━━━━━━━━━<br/>• Users Table<br/>• Calendar Events<br/>• OAuth Sessions")]
    end
    
    subgraph "External Services"
        GoogleOAuth["Google OAuth 2.0<br/>━━━━━━━━━━<br/>• PKCE Flow<br/>• Token Exchange"]
        GoogleCalAPI["Google Calendar API<br/>━━━━━━━━━━<br/>• Event Fetching<br/>• Calendar Access"]
    end
    
    User <==>|HTTP/WebSocket| NextApp
    NextApp <==> ConvexClient
    ConvexClient <==>|WebSocket| ConvexBackend
    ConvexBackend <==> ConvexDB
    NextApp -->|Redirect| GoogleOAuth
    GoogleOAuth -->|Callback| NextApp
    ConvexBackend -->|API Calls| GoogleCalAPI
    GoogleCalAPI -->|Events| ConvexBackend
    
    style User fill:#fff3e0
    style NextApp fill:#e3f2fd
    style ConvexClient fill:#e3f2fd
    style ConvexBackend fill:#f3e5f5
    style ConvexDB fill:#f3e5f5
    style GoogleOAuth fill:#e8f5e9
    style GoogleCalAPI fill:#e8f5e9
```

## Process Details

### Step 1: User Authentication
- User visits the application and enters their email
- System checks if user exists and has valid tokens
- If new user or expired tokens, redirects to Google OAuth
- User authorizes access to their Google Calendar
- OAuth tokens (access & refresh) are securely stored in Convex database

### Step 2: Calendar Sync
- After successful authentication, system automatically syncs calendar events
- Uses stored access token to fetch events from Google Calendar API
- All calendar events are stored in Convex database
- Sync can be triggered manually from dashboard

### Step 3: Query & Display
- User accesses dashboard to view their calendar events
- App queries Convex database (not Google API) for fast retrieval
- Events are displayed with details like time, location, and description
- Convex's real-time subscriptions push updates as new events are synced
- User can refresh sync to get latest events from Google Calendar

## Key Components

- **Frontend**: Next.js 15.5 with App Router
- **Backend**: Convex for serverless functions and database
- **Authentication**: Google OAuth 2.0 with PKCE flow
- **Data Storage**: Convex database for users and calendar events
- **API Integration**: Google Calendar API for event fetching
- **Real-time**: Convex reactive queries and subscriptions