import { Router } from 'elysia';
import { SyncController } from '../controllers/syncController';

const syncController = new SyncController();

export const setSyncRoutes = (router: Router) => {
    router.post('/sync/start', syncController.startSync.bind(syncController));
    router.post('/sync/stop', syncController.stopSync.bind(syncController));
};