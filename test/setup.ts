try {
  process.loadEnvFile('.env');
} catch {
  // en CI las variables vienen del entorno, no de un archivo
}
process.env.LOG_LEVEL = 'silent';