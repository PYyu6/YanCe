import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // HTTPS needed for camera + device orientation APIs on mobile
    // For local dev, Vite serves on localhost which browsers treat as secure
    port: 5173,
  },
});
