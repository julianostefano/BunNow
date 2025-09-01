
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
    // Sobe o servidor HTTP normalmente
    import('elysia').then(({ Elysia }) => {
        import('./routes/syncRoutes').then(({ setSyncRoutes }) => {
            const app = new Elysia();
            setSyncRoutes(app);
            const PORT = process.env.PORT || 3000;
            app.listen(PORT, () => {
                console.log(`Server is running on http://localhost:${PORT}`);
            });
        });
    });
}