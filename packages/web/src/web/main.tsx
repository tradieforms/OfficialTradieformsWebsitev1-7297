// Entry point referenced by index.html — composition only, real bootstrap
// lives in __main.tsx (template-managed). The returning managed-auth redirect
// leg is completed in app.tsx, which is awaited before this mounts.
import "./__main";
