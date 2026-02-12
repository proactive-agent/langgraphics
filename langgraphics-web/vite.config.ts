import {defineConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: '../langgraphics/static',
        emptyOutDir: true,
    },
    server: {
        watch: {
            usePolling: true,
        },
    },
    test: {
        environment: 'node',
        root: '../tests/web',
    },
})
