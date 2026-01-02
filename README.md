<p align="center">
  <img src="public/smolorchestrator_logo.png" width="150" alt="SmolOrchestrator Logo">
</p>

> **The Lightweight, Shared-Hosting Friendly AI Gateway.**  
> *Orchestrate your AI traffic with style, simplicity, and total control.*

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.2%2B-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Status](https://img.shields.io/badge/Status-Feature_Complete-success)]()

---

## 🚀 Why SmolOrchestrator?

SmolOrchestrator is a powerful, self-hosted AI Gateway designed for **maximum compatibility** and **minimal overhead**. Unlike other gateways that require Docker, Redis, or heavy VPS setups, SmolOrchestrator runs beautifully on **cheap shared hosting**.

### ✨ Key Features

*   **Zero Dependencies**: No `composer install`, no Docker, no Node.js required. Just drop the files and go.
*   **Shared Hosting Ready**: Built to bypass common restrictions (no `putenv`, no root access, no background daemons).
*   **Universal Compatibility**: Works out-of-the-box with **OpenRouter, Google AI Studio (Gemini), Vertex AI, Nvidia NIM,** and any OpenAI-compatible provider.
*   **Smart Routing**: Define fallbacks, load balancing, and priority routing for your models.
*   **Granular Control**: distinct API keys, strict quotas, and rate limiting per endpoint.
*   **Beautiful UI**: A "Cyber-Terminal" aesthetic (glassmorphism, glowing text) that makes managing AI feel like the future.
*   **Playground w/ Streaming**: Built-in testing terminal that supports streaming, thinking/reasoning models, and image/audio attachments.
*   **Robust Logging**: Asynchronous request logging and usage tracking that doesn't slow down your API calls.

---

## 🛠️ Tech Stack

*   **Backend**: PHP 8.2+ (Pure functionality, no frameworks)
*   **Database**: SQLite 3 (Portable, zero-config)
*   **Frontend**: Vanilla JS (ES6+) + TailwindCSS (via CDN)
*   **Security**: CSRF Protection, IP Rate Limiting, Brute Force Protection.

### Required PHP Extensions
Most shared hosts have these enabled by default:
*   `pdo_sqlite` (Database)
*   `curl` (API Requests)
*   `json` (Data handling)
*   `mbstring` (String manipulation)
*   `openssl` (Encryption)
*   *(Optional)* `apcu` (For high-speed memory caching) - **⚠️ Note: Caching is currently under development and temperamental.**

---

## 🕰️ Background Worker (Required)

SmolOrchestrator uses a background worker to process logs and quotas without slowing down user requests. You **must** set up a Cron Job to run `worker.php` every minute.

**Command:**
```bash
* * * * * php /path/to/your/smolorchestrator/public/worker.php >> /dev/null 2>&1
```

*(In cPanel, go to "Cron Jobs", select "Once Per Minute", and paste the command above. Ensure the path to PHP and your file is correct.)*

---

## 🔌 Compatibility

SmolOrchestrator acts as a transparent proxy that normalizes requests, making different providers speak the same language.

| Provider | Status | Notes |
| :--- | :---: | :--- |
| **OpenAI** | ✅ | Native support. |
| **OpenRouter** | ✅ | Works perfectly. |
| **Google Gemini** | ✅ | Works via their [OpenAI Compatibility](https://ai.google.dev/gemini-api/docs/openai) endpoints. |
| **Vertex AI** | ✅ | Works if using an OpenAI-compatible adapter. |
| **Nvidia NIM** | ✅ | Fully compatible. |
| **Groq / Cerebras** | ✅ | Fast inference supported. |

---

## 🎨 Visuals & Animations

We believe admin tools shouldn't be boring.

*   **Boot Sequence**: An optional CRT-style boot up animation on the login screen.
*   **Cyber-Glass UI**: Dark mode everything, with subtle glows and translucency.
*   **Terminal Typewriter**: The playground renders responses character-by-character for that retro-future feel.

*(You can disable animations in `System Settings` if you prefer a strictly utilitarian experience.)*

---

## 📦 Installation

SmolOrchestrator is designed for standard PHP environments (Shared Hosting, cPanel, Apache/Nginx).

1.  **Upload Files**  
    Upload the entire repository to your server. A common structure is:
    ```text
    /home/user/public_html/smolorchestrator/
    ```

2.  **Access Installer**  
    Navigate to the `public` folder in your browser:
    ```text
    https://your-server.com/smolorchestrator/public/install.php
    ```

3.  **Run Setup**  
    The installer will automatically check write permissions for `requests.db` and generate your initial admin credentials.

4.  **Secure Your Instance**  
    *   **Delete** `install.php` after successful setup.
    *   Ensure the `storage` directory is not directly accessible via web (`.htaccess` is included to prevent this).

---

## ⚡ Usage

Once installed, SmolOrchestrator exposes an OpenAI-compatible API.

### Endpoint Configuration
You can point any OpenAI-compatible client (LangChain, AutoGen, Chatbox, etc.) to your gateway.

*   **Base URL**: `https://your-server.com/smolorchestrator/public`
*   **Chat Completions**: `/v1/chat/completions`

### Example Request

```bash
curl https://your-server.com/smolorchestrator/public/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GENERATED_KEY" \
  -d '{
    "model": "your-assigned-endpoint-name",
    "messages": [
      {
        "role": "user",
        "content": "Hello via SmolOrchestrator!"
      }
    ]
  }'
```

### Admin Dashboard
Login to `https://your-server.com/smolorchestrator/public` to:
*   Create **Endpoints** (e.g., `gpt-4`, `cheap-chat`).
*   Map **Providers** (e.g., OpenRouter, Gemini) to those endpoints.
*   Generate **Access Keys** with strict quotas.

---

## 📜 License

This project is open-sourced software licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**. [LICENSE](LICENSE) for details.
