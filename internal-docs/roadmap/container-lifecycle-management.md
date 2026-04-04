# Container Lifecycle Management Strategy

This document outlines the strategy for managing multi-tenant Docker containers to balance high-performance user experience with server resource efficiency.

## 1. Deterministic Container Naming
To enable persistence and re-use, containers will follow a stable naming convention:
`adorable-user-${safeName}-${userId}`

**Logic**: 
- **safeName**: A sanitized version of the user's display name (e.g., `john_doe`).
- **userId**: The unique database ID to ensure no collisions if two users have the same name.
- On `container/start`, the server first checks for an existing container with this name.
- **Find or Create**:
    - **Running**: Return URL immediately.
    - **Paused/Stopped**: Resume/Start and return URL.
    - **Missing**: Create fresh.

## 2. Tiered Resource States (Cool-down Pipeline)

To save CPU and RAM without losing user progress, we implement a tiered inactivity pipeline:

| State | Trigger | Action | Resource Saving | UX Impact |
|-------|---------|--------|-----------------|-----------|
| **Active** | Request received | Reset "Last Activity" | None | Instant |
| **Idle** | 15 mins inactivity | `docker.pause()` | 100% CPU saved | Instant unpause (<500ms) |
| **Hibernate** | 2 hours inactivity / Logout | `docker.stop()` | 100% CPU & RAM saved | 5-10s restart (Dev server) |
| **Purge** | 24 hours inactivity | `docker.remove()` | Disk space cleanup | Full rebuild required |

## 3. Implementation Architecture

### Proxy Heartbeat
The `Global Proxy Middleware` in `main.ts` acts as the activity sensor.
- Every successful proxy request updates a `lastActivity` timestamp in the `ContainerRegistry`.

### The Background Reaper
A singleton service (e.g., `ContainerReaper`) runs every 5 minutes to:
1. Scan all managers in the `ContainerRegistry`.
2. Compare `lastActivity` with the current time.
3. Apply the appropriate state transition (Pause -> Stop -> Remove).

### Volume Persistence
To ensure code safety during "Stop" or "Remove" events:
- User workspaces are mounted as Docker Volumes:
  - Host: `./storage/projects/${userId}`
  - Container: `/app`
- This ensures that even if a container is purged to save resources, the files remain on the host disk.

## 4. RAM Pressure Management (Self-Healing)
If the host system reports high memory pressure (>85%), the Reaper proactively triggers "Hibernate" on the oldest Idle containers regardless of their individual timers to prevent OOM (Out Of Memory) events.

## 5. Next Steps
1. Refactor `DockerManager` to support `pause`/`unpause`.
2. Implement host-directory mounting for workspace persistence.
3. Implement the `ContainerReaper` background task.
4. Update `getUserId` to automatically trigger `unpause` if it detects a paused target.
