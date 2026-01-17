# MicroVM Options & Hosting Strategy

This document evaluates the technology choices and hosting strategies for implementing the **RemoteContainerEngine** (server-side execution environment).

## 1. Technology Comparison

When executing arbitrary user code on the server, **Security Isolation** is the primary concern.

| Technology | Isolation Level | Boot Time | Complexity | Best For... |
| :--- | :--- | :--- | :--- | :--- |
| **Docker (Standard)** | Process (Linux Namespaces) | Instant (<100ms) | Low | Internal tools, CI/CD where trust is high. **NOT recommended for untrusted user code.** |
| **Firecracker (MicroVM)** | Hardware (KVM) | Fast (~125ms) | High | **Production-grade multi-tenant code execution.** Used by AWS Lambda, Fly.io. |
| **gVisor / Kata** | Kernel Proxy / VM | Medium | Medium | Kubernetes environments needing extra security. |

**Recommendation:** **Firecracker** is the industry standard for secure, fast, multi-tenant code execution. However, orchestration is complex.

---

## 2. Hosting & Deployment Strategies

### Option A: Managed Firecracker (PaaS) - **Recommended Start**
Use a provider that abstracts the Firecracker orchestration but gives you a "Machine" API.

#### **Fly.io**
*   **How it works:** You use their API to spawn "Machines". Each Machine is a Firecracker VM.
*   **Pros:** 
    *   Zero orchestration code (no managing Kubernetes/Nomad).
    *   Global distribution.
    *   Fast boot times.
    *   Stop/Start API (scale-to-zero).
*   **Cons:** Vendor lock-in to Fly.io API.
*   **Cost:** 
    *   ~ $0.00000xxx / second.
    *   Shared CPU 1x + 256MB RAM: **~$2/month** (if running 24/7). 
    *   **Scale-to-Zero:** If you shut them down when idle, cost is negligible.

#### **Koyeb**
*   Similar to Fly.io, offers Firecracker-backed microservices. Good alternative.

### Option B: Self-Hosted Firecracker (Bare Metal)
Rent bare metal servers and run your own orchestration (e.g., using `ignite` or custom Go/Rust controller).

*   **Providers:** AWS EC2 Metal, Hetzner Dedicated, Equinix Metal.
*   **Pros:** Lowest marginal cost per VM at scale (1000s of instances). Total control.
*   **Cons:** **Extremely High Operational Complexity.** You must manage networking (CNI), storage (CSI), OS images, and security updates yourself.
*   **Cost:** High fixed cost (e.g., $50-100/mo per server minimum).

### Option C: Docker-in-Docker / Sandboxed Containers (Easiest / Risky)
Run standard Docker containers on a regular VPS or App Runner.

*   **Providers:** Render, DigitalOcean, AWS Fargate.
*   **Pros:** Standard Docker API. Easy to build.
*   **Cons:** **Security Risk.** If a user escapes the container, they own the node. 
*   **Mitigation:** Use **gVisor** (Google's sandbox) inside the container runtime if possible, or assume high risk.

---

## 3. Local Development Strategy

To bridge the gap between developing locally on macOS/Windows and deploying to a MicroVM backend (Fly.io/Firecracker), we need a local simulation layer.

### **LocalContainerEngine (Docker/Podman)**
*   **Concept:** Use the local Docker Daemon or Podman to spawn containers that mimic the remote MicroVMs.
*   **Workflow:**
    1.  **Dev Mode:** When the backend runs with `NODE_ENV=development`, it swaps the `RemoteContainerEngine` for `LocalContainerEngine`.
    2.  **API Parity:** The backend "Orchestrator" talks to the local Docker socket instead of the Fly.io API.
    3.  **Result:** You get a full "Server-Side" experience (real Linux environment, multi-language support) running entirely on your laptop.

### **Docker vs. Podman**
*   **Docker:** The standard choice. Native "Docker Desktop" handles the VM layer on macOS/Windows seamlessly.
*   **Podman:** Fully compatible via its Docker-compatible socket (`podman system service`).
    *   **Advantage:** Daemonless, rootless (better security locally).
    *   **Usage:** Simply point the backend to the Podman socket path. The application logic remains identical.

---

## 4. Cost Scenarios (Estimated)

**Scenario:** 100 Active Users per day, each using the environment for 1 hour. Total: 3,000 hours/month.

| Provider | Strategy | Est. Cost / Month | Dev Ops Effort |
| :--- | :--- | :--- | :--- |
| **Fly.io** | Managed Firecracker (Machines) | ~$10 - $20 | Low |
| **AWS Fargate** | Managed Containers | ~$40 - $60 | Medium |
| **Hetzner** | Self-Hosted Bare Metal | ~$60 (Fixed) | **Very High** |
| **Render** | Docker Service (Persistent) | ~$7/instance * Users (Expensive!) | Low |

## 4. Final Recommendation

**1. Phase 1 (MVP): Fly.io Machines**
*   Use the Fly.io Machines API to spawn a MicroVM for each active user project.
*   **Workflow:**
    1.  User opens project.
    2.  Backend calls Fly API to start Machine (boot time < 2s).
    3.  Backend proxies WebSocket to Machine.
    4.  Machine shuts down automatically after 15m idle.
*   **Why:** Low risk, low cost, high security (Firecracker), low dev effort.

**2. Phase 2 (Scale): Custom Orchestrator**
*   If costs explode (> $1k/mo), migrate to bare metal servers (Hetzner/Equinix) running Firecracker directly.
*   Port the `ContainerEngine` interface to talk to your new orchestrator.
