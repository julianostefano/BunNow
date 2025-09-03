
// Detecta argumentos CLI antes de subir o servidor
const userArgs = process.argv.slice(2);
const isCli = userArgs.length > 0;

if (isCli) {
    // Executa CLI
    import('./cli/index').then(cli => {
        if (cli && typeof cli.main === 'function') {
            cli.main();
        }
    });
} else {
    // Sobe o servidor HTTP com notificações integradas
    import('./routes/index').then(({ createMainApp }) => {
        createMainApp().then(app => {
            const PORT = process.env.PORT || 3008;
            
            console.log('🚀 Starting BunSNC Server...');
            
            app.listen(PORT, () => {
                console.log(`✅ BunSNC Server running on http://localhost:${PORT}`);
                console.log('📡 Real-time notifications enabled');
                console.log('🔗 WebSocket endpoint: ws://localhost:${PORT}/ws');
                console.log('📊 SSE endpoints: http://localhost:${PORT}/events/*');
                console.log('🔧 API documentation: http://localhost:${PORT}/');
            });
        }).catch(error => {
            console.error('❌ Failed to start server:', error);
            process.exit(1);
        });
    });
}