// Registers the extension-resolution hook so repo node scripts can import
// src/utils/* (which use Vite-style extensionless relative imports).
// Usage in other scripts:  import './register-esm-hook.mjs';
import { register } from 'node:module';

register(new URL('./esm-resolve-hook.mjs', import.meta.url).href);
