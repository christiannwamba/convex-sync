# Google Calendar Sync Architecture - With Automatic Caching

## High-Level Overview

This document extends the base architecture to highlight Convex's **automatic query caching** feature. Convex caches all query results out-of-the-box - when the same query with identical parameters is made, results are served from cache instantly without hitting the database.

## 🚀 Automatic Caching Benefits

- **Zero Configuration**: Caching happens automatically without any setup
- **Instant Response**: Cached queries return in microseconds
- **Smart Invalidation**: Cache automatically updates when underlying data changes
- **Same Input = Cache Hit**: Identical query parameters guarantee cached results

## System Flow Diagrams with Caching

### 1. Flowchart View with Cache Layer

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
        ConvexEvents -->|Invalidate| CacheInvalidate[["🔄 Cache<br/>Auto-Invalidated"]]
    end

    subgraph Step3["📊 Step 3: Cached Query & Display"]
        Dashboard -->|Request Events| CacheCheck{{"⚡ Cache Check<br/>(Automatic)"}}
        CacheCheck -->|Cache Hit<br/>~1ms| CachedResults[["📦 Cached<br/>Results"]]
        CacheCheck -->|Cache Miss| ConvexQuery[(Convex DB<br/>Query)]
        ConvexQuery -->|Store in Cache| CachedResults
        CachedResults -->|Return Events| DisplayEvents[Display Events]
        DisplayEvents -->|View| UserView([👤 User Views Events])
    end

    style Step1 fill:#e1f5fe
    style Step2 fill:#f3e5f5
    style Step3 fill:#e8f5e9
    style User fill:#fff3e0
    style UserView fill:#fff3e0
    style CacheCheck fill:#ffeb3b,stroke:#f57c00,stroke-width:3px
    style CachedResults fill:#c8e6c9,stroke:#4caf50,stroke-width:2px
    style CacheInvalidate fill:#ffccbc,stroke:#ff5722,stroke-width:2px
```

### 2. Sequence Diagram with Caching

This sequence diagram shows how caching intercepts queries automatically:

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant App as Next.js App
    participant Cache as ⚡ Convex Cache<br/>(Automatic)
    participant Conv as Convex DB
    participant GOAuth as Google OAuth
    participant GCal as Google Calendar API
    
    rect rgb(225, 245, 254)
        Note over U,GOAuth: Step 1: Authentication (Same as before)
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
        Note over App,GCal: Step 2: Sync Events (Invalidates Cache)
        App->>Conv: Get user tokens
        Conv-->>App: Return tokens
        App->>GCal: Fetch calendar events
        GCal-->>App: Return events array
        loop For each event
            App->>Conv: Store event in DB
            Conv->>Cache: Auto-invalidate related queries
            Conv--)U: Real-time update
        end
    end
    
    rect rgb(232, 245, 233)
        Note over U,Cache: Step 3: Cached Queries
        U->>App: View dashboard (1st time)
        App->>Cache: Query events for user
        Cache->>Cache: Check cache (MISS)
        Cache->>Conv: Execute query
        Conv-->>Cache: Return results
        Cache->>Cache: Store in cache
        Cache-->>App: Return events
        App->>U: Display events
        
        Note over U,Cache: Subsequent identical queries
        U->>App: Refresh page (same query)
        App->>Cache: Query events for user
        Cache->>Cache: Check cache (HIT! ⚡)
        Cache-->>App: Return cached events (~1ms)
        App->>U: Display events instantly
        
        loop Real-time updates
            Conv--)Cache: Data change detected
            Cache->>Cache: Auto-invalidate
            Cache--)App: Push new data
            App--)U: Update display
        end
    end
```

### 3. Component Diagram with Cache Layer

This component diagram shows the cache layer position in the architecture:

```mermaid
graph TB
    subgraph "User Layer"
        User[["👤 User<br/>Browser"]]
    end
    
    subgraph "Application Layer"
        NextApp["Next.js Application<br/>━━━━━━━━━━<br/>• Pages & Routes<br/>• OAuth Handler<br/>• UI Components"]
        ConvexClient["Convex Client<br/>━━━━━━━━━━<br/>• Real-time Subscriptions<br/>• Query/Mutation Calls"]
    end
    
    subgraph "Convex Platform"
        CacheLayer[["⚡ Query Cache Layer<br/>━━━━━━━━━━<br/>• Automatic Caching<br/>• Zero Config<br/>• Smart Invalidation<br/>• ~1ms Response"]]
        ConvexBackend["Convex Backend<br/>━━━━━━━━━━<br/>• Actions & Mutations<br/>• Database Queries<br/>• Token Management"]
        ConvexDB[("Convex Database<br/>━━━━━━━━━━<br/>• Users Table<br/>• Calendar Events<br/>• OAuth Sessions")]
    end
    
    subgraph "External Services"
        GoogleOAuth["Google OAuth 2.0<br/>━━━━━━━━━━<br/>• PKCE Flow<br/>• Token Exchange"]
        GoogleCalAPI["Google Calendar API<br/>━━━━━━━━━━<br/>• Event Fetching<br/>• Calendar Access"]
    end
    
    User <==>|HTTP/WebSocket| NextApp
    NextApp <==> ConvexClient
    ConvexClient <==>|WebSocket| CacheLayer
    CacheLayer <==>|Cache Hit/Miss| ConvexBackend
    ConvexBackend <==> ConvexDB
    NextApp -->|Redirect| GoogleOAuth
    GoogleOAuth -->|Callback| NextApp
    ConvexBackend -->|API Calls| GoogleCalAPI
    GoogleCalAPI -->|Events| ConvexBackend
    
    style User fill:#fff3e0
    style NextApp fill:#e3f2fd
    style ConvexClient fill:#e3f2fd
    style CacheLayer fill:#ffeb3b,stroke:#f57c00,stroke-width:3px
    style ConvexBackend fill:#f3e5f5
    style ConvexDB fill:#f3e5f5
    style GoogleOAuth fill:#e8f5e9
    style GoogleCalAPI fill:#e8f5e9
```

## How Convex Caching Works

### Automatic Query Caching

1. **First Query Execution**:
   - User requests calendar events (e.g., `getUserCalendarEventsByEmail({ email: "user@example.com" })`)
   - Cache layer checks: No cached result found (MISS)
   - Query executes against database
   - Results stored in cache with query signature as key
   - Results returned to user

2. **Subsequent Identical Queries**:
   - Same user or different user makes identical query
   - Cache layer checks: Cached result found (HIT)
   - Results served directly from cache (~1ms response)
   - Database is never touched

3. **Cache Invalidation**:
   - When calendar sync updates events in database
   - Convex automatically detects which queries are affected
   - Related cache entries are invalidated
   - Next query will fetch fresh data

### Cache Key Example

```typescript
// These queries will HIT the same cache entry:
getUserCalendarEventsByEmail({ email: "john@example.com", limit: 20 })
getUserCalendarEventsByEmail({ email: "john@example.com", limit: 20 })

// This query will MISS (different parameters):
getUserCalendarEventsByEmail({ email: "jane@example.com", limit: 20 })
getUserCalendarEventsByEmail({ email: "john@example.com", limit: 50 })
```

## Performance Impact

### Without Cache (Traditional Architecture)
- Every query hits the database
- Response time: 10-50ms per query
- Database load increases with users
- Scaling requires database optimization

### With Convex Automatic Caching
- ✅ Identical queries served from cache
- ✅ Response time: ~1ms for cache hits
- ✅ Database load dramatically reduced
- ✅ Zero configuration required
- ✅ Automatic cache invalidation
- ✅ Scales effortlessly

## Real-World Scenario

When multiple users view the dashboard:

1. **User A** visits dashboard → Query executes → 30ms (cache MISS)
2. **User A** refreshes page → Same query → 1ms (cache HIT) ⚡
3. **User A** navigates away and returns → Same query → 1ms (cache HIT) ⚡
4. **Calendar sync** runs → Cache invalidated for affected queries
5. **User A** visits dashboard → Query executes → 30ms (cache MISS, fresh data)
6. **User A** refreshes again → Same query → 1ms (cache HIT) ⚡

## Key Takeaways

- 🎯 **Zero Setup**: Caching works out-of-the-box with Convex
- ⚡ **Lightning Fast**: Cache hits return in ~1ms
- 🔄 **Always Fresh**: Smart invalidation ensures data consistency
- 📈 **Scalable**: Reduces database load automatically
- 🎨 **Transparent**: No code changes needed to enable caching