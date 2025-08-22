# Google Calendar Sync Architecture - With WorkPool Queue

## High-Level Overview

This document extends the workflow architecture to showcase Convex's **WorkPool component** - a queue-based system for controlling parallel execution and respecting API rate limits. WorkPool ensures that even when syncing thousands of events, we never overwhelm the Google Calendar API.

## 🎯 What is WorkPool?

**WorkPool** is Convex's queue management system that:
- ⚡ **Controls Parallelism**: Limits concurrent operations (e.g., max 5 parallel API calls)
- 📦 **Queues Excess Work**: Additional requests wait in queue until a slot opens
- 🔄 **Self-Enqueueing**: Operations can add more work to the queue (pagination)
- 🛡️ **Rate Limit Protection**: Prevents API throttling by controlling request rate
- 💪 **Built on Workflows**: Inherits durability and retry capabilities

## System Flow Diagrams with WorkPool

### 1. Without vs With WorkPool - Fetching Large Event Sets

This diagram shows the critical difference when fetching a user with 1000+ calendar events:

```mermaid
flowchart TB
    subgraph "❌ WITHOUT WORKPOOL (Naive Approach)"
        User1([User with 1000 Events]) --> Fetch1[Fetch ALL Events]
        Fetch1 -->|Single API Call| API1[Google Calendar API]
        API1 -->|❌ 413 Payload Too Large| Fail1[["💥 REQUEST FAILS<br/>Too many events"]]
        
        User2([Alternative: Loop Approach]) --> Loop1[Fetch Page 1]
        Loop1 --> Loop2[Fetch Page 2]
        Loop2 --> Loop3[Fetch Page 3]
        Loop3 --> LoopN[... Fetch Page N]
        LoopN -->|20+ Concurrent Calls| API2[Google Calendar API]
        API2 -->|❌ 429 Rate Limited| Fail2[["💥 RATE LIMIT HIT<br/>Too many requests"]]
        
        style Fail1 fill:#ff5252,color:#fff,stroke:#d32f2f,stroke-width:3px
        style Fail2 fill:#ff5252,color:#fff,stroke:#d32f2f,stroke-width:3px
    end
    
    subgraph "✅ WITH WORKPOOL (Queue-Based)"
        User3([User with 1000 Events]) --> WF[["🔄 Workflow Step:<br/>Start Paginated Sync"]]
        
        WF --> Pool[["📊 WorkPool Queue<br/>━━━━━━━━━━<br/>Max Parallel: 5<br/>Batch Size: 250"]]
        
        Pool --> Batch1[Batch 1<br/>Events 1-250]
        Pool --> Batch2[Batch 2<br/>Events 251-500]
        Pool --> Batch3[Batch 3<br/>Events 501-750]
        Pool --> Batch4[Batch 4<br/>Events 751-1000]
        
        Batch1 -->|Running| API3[Google API]
        Batch2 -->|Running| API3
        Batch3 -->|Running| API3
        Batch4 -->|Queued| Queue[["⏳ Waiting Queue"]]
        
        API3 -->|Success| Store1[(Store Events<br/>in Convex DB)]
        
        Batch1 -->|Complete| Next1[Slot Opens]
        Next1 --> Queue
        Queue -->|Dequeue| Batch4
        Batch4 -->|Now Running| API3
        
        Store1 --> Success[["✅ ALL 1000 EVENTS<br/>SYNCED SUCCESSFULLY<br/>No rate limits hit!"]]
        
        style Success fill:#4caf50,color:#fff,stroke:#2e7d32,stroke-width:3px
        style Pool fill:#ffeb3b,stroke:#f57c00,stroke-width:3px
        style Queue fill:#fff3e0,stroke:#ff9800,stroke-width:2px
        style WF fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    end
```

### 2. Flowchart - Workflow with WorkPool Integration

```mermaid
flowchart TB
    subgraph CalendarSync["📅 Calendar Sync Workflow + WorkPool"]
        Start([Sync Triggered]) --> WS1[["📌 Workflow Step 1:<br/>Get User by Email"]]
        WS1 -->|State Persisted| WS2[["📌 Workflow Step 2:<br/>Get Fresh Tokens<br/>Retry: 3x"]]
        WS2 -->|Token: abc123<br/>State Persisted| WS3[["📌 Workflow Step 3:<br/>Clear Existing Events"]]
        WS3 -->|State Persisted| WS4[["📌 Workflow Step 4:<br/>Start Paginated Sync"]]
        
        WS4 -->|Enqueue First Batch| WorkPool[["📊 WorkPool Manager<br/>━━━━━━━━━━<br/>• Max Parallel: 5<br/>• Retry: 3x, Backoff: 1s<br/>• Batch Size: 250 events"]]
        
        WorkPool --> Active[["🔄 Active Workers (Max 5)"]]
        WorkPool --> Queued[["⏳ Queued Batches"]]
        
        Active --> B1[["Batch 1<br/>Fetch & Store<br/>Events 1-250"]]
        Active --> B2[["Batch 2<br/>Fetch & Store<br/>Events 251-500"]]
        Active --> B3[["Batch 3<br/>Fetch & Store<br/>Events 501-750"]]
        Active --> B4[["Batch 4<br/>Fetch & Store<br/>Events 751-1000"]]
        Active --> B5[["Batch 5<br/>Fetch & Store<br/>Events 1001-1250"]]
        
        Queued --> B6[["Batch 6<br/>Waiting..."]]
        Queued --> B7[["Batch 7<br/>Waiting..."]]
        Queued --> BN[["Batch N<br/>Waiting..."]]
        
        B1 -->|Has nextPageToken?| CheckMore1{More Events?}
        CheckMore1 -->|Yes| EnqueueNext1[["Enqueue Batch N+1"]]
        CheckMore1 -->|No| Complete1[Batch Complete]
        
        EnqueueNext1 --> Queued
        
        Complete1 --> FinalCheck{All Batches Done?}
        FinalCheck -->|Yes| Success([✅ Sync Complete])
        FinalCheck -->|No| Continue[Process Queue]
        Continue --> Active
    end
    
    style WorkPool fill:#ffeb3b,stroke:#f57c00,stroke-width:3px
    style Active fill:#c8e6c9,stroke:#4caf50,stroke-width:2px
    style Queued fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    style WS1 fill:#e3f2fd
    style WS2 fill:#e3f2fd
    style WS3 fill:#e3f2fd
    style WS4 fill:#e3f2fd
```

### 3. Sequence Diagram - Rate-Limited Batch Processing

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant WF as 🔄 Workflow
    participant WP as 📊 WorkPool
    participant Conv as Convex DB
    participant GCal as Google Calendar API
    
    Note over U,GCal: User has 2000 events to sync (8 batches of 250)
    
    U->>WF: Start Calendar Sync
    WF->>WF: Step 1-3: Get User, Tokens, Clear Events
    
    rect rgb(255, 235, 59, 0.2)
        Note over WF,WP: Step 4: Start Paginated Sync via WorkPool
        WF->>WP: Enqueue Batch 1
        WP->>WP: Check Active Workers (0/5)
        WP->>WP: Start Worker 1
        
        par Parallel Execution (Max 5)
            WP->>GCal: Batch 1: Fetch events 1-250
            and
            WP->>WP: Batch 1 returns nextPageToken
            WP->>WP: Auto-enqueue Batch 2
            WP->>GCal: Batch 2: Fetch events 251-500
            and
            WP->>WP: Batch 2 returns nextPageToken
            WP->>WP: Auto-enqueue Batch 3
            WP->>GCal: Batch 3: Fetch events 501-750
            and
            WP->>WP: Auto-enqueue Batch 4
            WP->>GCal: Batch 4: Fetch events 751-1000
            and
            WP->>WP: Auto-enqueue Batch 5
            WP->>GCal: Batch 5: Fetch events 1001-1250
        end
        
        Note over WP: Workers: 5/5 (MAX REACHED)
        
        WP->>WP: Auto-enqueue Batch 6
        WP->>WP: ⏳ Queue: Batch 6 (waiting)
        WP->>WP: Auto-enqueue Batch 7
        WP->>WP: ⏳ Queue: Batches 6, 7 (waiting)
        WP->>WP: Auto-enqueue Batch 8
        WP->>WP: ⏳ Queue: Batches 6, 7, 8 (waiting)
    end
    
    rect rgb(76, 175, 80, 0.2)
        Note over WP,Conv: Batches Complete & Store
        GCal-->>WP: Batch 1 Complete (250 events)
        WP->>Conv: Store Batch 1 events
        WP->>WP: Worker 1 freed
        WP->>WP: Dequeue Batch 6
        WP->>GCal: Batch 6: Fetch events 1251-1500
        
        GCal-->>WP: Batch 2 Complete (250 events)
        WP->>Conv: Store Batch 2 events
        WP->>WP: Worker 2 freed
        WP->>WP: Dequeue Batch 7
        WP->>GCal: Batch 7: Fetch events 1501-1750
        
        Note over WP: Continue until all batches processed...
        
        GCal-->>WP: Batch 8 Complete (250 events)
        WP->>Conv: Store Batch 8 events
        WP->>WP: No nextPageToken
        WP->>WP: All batches complete!
    end
    
    WP-->>WF: Sync Complete
    WF-->>U: ✅ 2000 events synced!
```

### 4. Component Diagram with WorkPool Layer

```mermaid
graph TB
    subgraph "User Layer"
        User[["👤 User<br/>Browser"]]
    end
    
    subgraph "Application Layer"
        NextApp["Next.js Application<br/>━━━━━━━━━━<br/>• Pages & Routes<br/>• OAuth Handler<br/>• UI Components"]
        ConvexClient["Convex Client<br/>━━━━━━━━━━<br/>• Workflow Triggers<br/>• Query/Mutation Calls"]
    end
    
    subgraph "Convex Platform"
        WorkflowManager[["🔄 Workflow Manager<br/>━━━━━━━━━━<br/>• Durable Execution<br/>• State Persistence<br/>• Step Orchestration"]]
        
        WorkPoolManager[["📊 WorkPool Manager<br/>━━━━━━━━━━<br/>• Queue Management<br/>• Parallelism Control (Max: 5)<br/>• Auto-retry (3x, 1s backoff)<br/>• Self-enqueueing"]]
        
        ConvexBackend["Convex Backend<br/>━━━━━━━━━━<br/>• Actions & Mutations<br/>• Database Queries<br/>• Token Management"]
        
        ConvexDB[("Convex Database<br/>━━━━━━━━━━<br/>• Users Table<br/>• Calendar Events<br/>• OAuth Sessions<br/>• Workflow State<br/>• WorkPool Queue")]
    end
    
    subgraph "External Services"
        GoogleOAuth["Google OAuth 2.0<br/>━━━━━━━━━━<br/>• PKCE Flow<br/>• Token Exchange"]
        GoogleCalAPI["Google Calendar API<br/>━━━━━━━━━━<br/>• Event Fetching<br/>• Rate Limited API<br/>• Pagination Support"]
    end
    
    User <==>|HTTP/WebSocket| NextApp
    NextApp <==> ConvexClient
    ConvexClient <==>|Start Workflow| WorkflowManager
    WorkflowManager <==>|Enqueue Work| WorkPoolManager
    WorkPoolManager <==>|Execute Actions| ConvexBackend
    ConvexBackend <==> ConvexDB
    WorkPoolManager -.->|Queue State| ConvexDB
    WorkflowManager -.->|Workflow State| ConvexDB
    NextApp -->|Redirect| GoogleOAuth
    GoogleOAuth -->|Callback| NextApp
    WorkPoolManager ==>|Rate-Limited Calls<br/>Max 5 Parallel| GoogleCalAPI
    GoogleCalAPI -->|Paginated Results| WorkPoolManager
    
    style User fill:#fff3e0
    style NextApp fill:#e3f2fd
    style ConvexClient fill:#e3f2fd
    style WorkflowManager fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style WorkPoolManager fill:#ffeb3b,stroke:#f57c00,stroke-width:3px
    style ConvexBackend fill:#f3e5f5
    style ConvexDB fill:#f3e5f5
    style GoogleOAuth fill:#e8f5e9
    style GoogleCalAPI fill:#e8f5e9
```

## Implementation Details

### WorkPool Configuration

```typescript
// From calendar.ts - WorkPool setup
export const calendarApiPool = new Workpool(components.calendarApiWorkpool, {
  maxParallelism: 5,        // Max 5 concurrent Google API calls
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 3,          // Retry failed requests 3 times
    initialBackoffMs: 1000,  // Start with 1 second delay
    base: 2                  // Double delay each retry (1s → 2s → 4s)
  },
});
```

### Workflow Integration with WorkPool

```typescript
// Workflow Step 4: Start paginated sync through WorkPool
const batchResult = await step.runAction(internal.calendar._startPaginatedSync, {
  userId: user._id,
  accessToken,               // Token preserved from Step 2
  userEmail: args.userEmail,
  maxEventsPerBatch: 250,    // Batch size
});
```

### Self-Enqueueing Batch Processing

```typescript
// Each batch can enqueue the next batch
if (batch.nextPageToken) {
  await calendarApiPool.enqueueAction(
    ctx,
    internal.calendar._fetchAndStoreBatch,
    {
      userId: args.userId,
      accessToken: args.accessToken,  // Reuse same token
      userEmail: args.userEmail,
      maxResults: args.maxResults,
      pageToken: batch.nextPageToken, // Continue from here
      batchNumber: args.batchNumber + 1,
    }
  );
}
```

## Real-World Scenario: Syncing 5000 Events

### Without WorkPool
- **Attempt 1**: Single API call for 5000 events → **FAILS** (payload too large)
- **Attempt 2**: 20 parallel API calls → **FAILS** (rate limited after ~10 calls)
- **Result**: Sync fails, user frustrated

### With WorkPool
1. **Workflow starts** → Tokens fetched and saved in state
2. **WorkPool activated** → First batch enqueued
3. **Batch 1-5 start** → 5 parallel API calls (max reached)
4. **Batch 6-20 queued** → Waiting for available workers
5. **As batches complete** → Queue automatically processed
6. **Total time**: ~4 seconds per batch × 4 rounds = 16 seconds
7. **Result**: All 5000 events synced successfully, no rate limits hit!

## Queue Visualization

```
Time →
┌─────────────────────────────────────────────────────┐
│ T=0s:   [B1][B2][B3][B4][B5] | Queue: B6,B7,B8...  │
│ T=1s:   [B1][B2][B3][B4][B5] | Queue: B6,B7,B8...  │
│ T=2s:   ✓B1 [B6][B2][B3][B4][B5] | Queue: B7,B8... │
│ T=3s:   ✓B1 [B6]✓B2 [B7][B3][B4][B5] | Queue: B8...│
│ T=4s:   ✓B1 [B6]✓B2 [B7]✓B3 [B8][B4][B5] | Queue: │
└─────────────────────────────────────────────────────┘
Legend: [Bn] = Running, ✓Bn = Complete, Queue = Waiting
```

## Benefits of WorkPool + Workflow

| Challenge | Without WorkPool | With WorkPool |
|-----------|-----------------|---------------|
| **Large Data Sets** | Single request fails or timeout | Automatically batched into manageable chunks |
| **Rate Limiting** | 429 errors crash the sync | Respects API limits with controlled parallelism |
| **Memory Usage** | Load all events in memory | Process in small batches |
| **Failure Recovery** | Restart entire sync | Only retry failed batch |
| **Progress Tracking** | All or nothing | Incremental progress saved |
| **User Experience** | Long wait or failure | Smooth, reliable sync |

## Configuration Strategies

### Conservative (Default)
```typescript
maxParallelism: 5     // Safe for most APIs
batchSize: 250        // Moderate batch size
```

### Aggressive (High Volume)
```typescript
maxParallelism: 10    // If API allows
batchSize: 500        // Larger batches
```

### Ultra-Safe (Strict APIs)
```typescript
maxParallelism: 2     // Very restrictive APIs
batchSize: 100        // Smaller batches
```

## Monitoring & Debugging

WorkPool provides visibility into:
- 📊 **Queue Length**: How many batches are waiting
- 🏃 **Active Workers**: Current parallel operations
- ✅ **Completion Rate**: Successful vs failed batches
- ⏱️ **Processing Time**: Average time per batch
- 🔄 **Retry Count**: How often retries are needed

## Conclusion

By combining **Workflow** (durability) with **WorkPool** (queue management), the architecture achieves:

- ✅ **Unlimited Scale**: Sync any number of events without failures
- ✅ **Rate Limit Compliance**: Never overwhelm external APIs
- ✅ **Optimal Performance**: Maximum throughput within limits
- ✅ **Reliability**: Automatic retry and failure recovery
- ✅ **Efficiency**: Minimal API calls with batch processing
- ✅ **Observability**: Clear visibility into sync progress

This architecture turns a fragile "all-or-nothing" sync into a robust, scalable, and efficient operation that handles everything from 10 to 10,000+ events seamlessly.