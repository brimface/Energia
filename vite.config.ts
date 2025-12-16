import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carregar variáveis de ambiente baseadas no modo atual (development/production)
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Isto permite que o código 'process.env.API_KEY' continue a funcionar
      // substituindo-o pelo valor real durante o build ou dev
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})