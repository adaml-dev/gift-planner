import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

let commitHash = 'dev';
let commitDate = '';

try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  commitDate = execSync('git log -1 --format="%cd" --date=format:"%Y-%m-%d %H:%M:%S"').toString().trim();
} catch (e) {
  console.warn('Could not read git commit info:', e);
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __COMMIT_DATE__: JSON.stringify(commitDate),
  }
})

