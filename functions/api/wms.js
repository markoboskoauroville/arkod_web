// /api/wms?... → the state's cadastral WMS (GetMap pictures and GetFeatureInfo text), with CORS.
import { forward, TARGETS, queryOf } from '../_proxy.js';

export const onRequest = ({ request }) => forward(request, 'wms', TARGETS.wms + queryOf(request));
