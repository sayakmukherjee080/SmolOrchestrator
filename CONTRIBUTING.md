# Contributing to SmolOrchestrator

Thank you for your interest in contributing! We want to keep SmolOrchestrator lightweight, secure, and compatible with shared hosting environments. To maintain these goals, please adhere to the following strict guidelines.

## 🚫 Constraints & Non-Negotiables

1.  **No Package Managers**: 
    *   **NO Composer**. **NO NPM**.
    *   The project is designed to be "drag-and-drop" deployable. All dependencies must be vendor-bundled or strictly native.
    
2.  **Shared Hosting Compatibility**:
    *   Do not rely on **CLI commands**, **Corn Jobs** (unless optional), or **Root Access**.
    *   Avoid usage of `putenv()` or `getenv()` for critical configuration (many shared hosts block these). Use the internal `Config` class.
    *   Keep memory usage low.

3.  **Database**:
    *   **SQLite Only**. Do not introduce MySQL/PostgreSQL dependencies.
    *   All migrations must be handled in PHP within the codebase (no external migration tools).

## 📝 Code Style

*   **PHP**: Follow **PSR-12** where possible, but prioritize readability and simplicity.
    *   Strict typing (`declare(strict_types=1);`) is required for new files.
*   **HTML/CSS**: Use semantic HTML. Use TailwindCSS utility classes. Do not write custom CSS unless absolutely necessary for specific animations (put those in `style.css`).
*   **JavaScript**: Vanilla ES6+. No frameworks (React, Vue, jQuery). Keep it raw and fast.

## 🔒 Security Guidelines

1.  **Sanitization**: All user input must be sanitized. Use `htmlspecialchars()` for outputting data.
2.  **Prepared Statements**: **ALWAYS** use PDO prepared statements for database queries. No exceptions.
3.  **CSRF**: All POST requests must include a valid CSRF token using `csrf_token()`.

## 🧪 Testing

Since we do not use a heavy CI/CD pipeline ensuring shared-hosting compatibility:
1.  **Manual Verification**: You must manually verify your changes on a restrictive PHP environment (e.g., standard MAMP/XAMPP or a cheap shared host).
2.  **Proof of Work**: Pull Requests must include screenshots or a brief video demonstrating the change working.

## 🚀 Pull Request Process

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (**Strict Semantic Commits**: `feat:`, `fix:`, `docs:`, `style:`).
4.  Push to the branch.
5.  Open a Pull Request describing *what* changed and *why*.

---

**By contributing, you agree that your code will be licensed under the AGPLv3 license.**
